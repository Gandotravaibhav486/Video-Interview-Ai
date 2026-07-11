import { createServiceRoleClient } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/stt/whisper";
import { scoreAnswer, type FrameImage } from "@/lib/ai/scoring";
import { maybeFinalizeSession } from "@/lib/ai/finalize-session";

export async function processAnswer(answerId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  try {
    await supabase
      .from("answers")
      .update({ transcript_status: "processing", feedback_status: "processing" })
      .eq("id", answerId);

    const { data: answer, error: answerError } = await supabase
      .from("answers")
      .select("*")
      .eq("id", answerId)
      .single();
    if (answerError || !answer) throw new Error("answer not found");

    const { data: question, error: questionError } = await supabase
      .from("session_questions")
      .select("*")
      .eq("id", answer.question_id)
      .single();
    if (questionError || !question) throw new Error("question not found");

    const { data: videoBlob, error: videoError } = await supabase.storage
      .from("recordings")
      .download(answer.video_storage_path!);
    if (videoError || !videoBlob) {
      throw new Error(videoError?.message ?? "failed to download video");
    }
    const videoBuffer = Buffer.from(await videoBlob.arrayBuffer());

    const transcript = await transcribeAudio(videoBuffer);
    await supabase
      .from("answers")
      .update({ transcript, transcript_status: "complete" })
      .eq("id", answerId);

    const frames: FrameImage[] = [];
    for (const framePath of answer.frames_extracted ?? []) {
      const { data: frameBlob } = await supabase.storage
        .from("frames")
        .download(framePath);
      if (frameBlob) {
        const buffer = Buffer.from(await frameBlob.arrayBuffer());
        frames.push({ base64: buffer.toString("base64"), mediaType: "image/jpeg" });
      }
    }

    const result = await scoreAnswer({
      questionText: question.question_text,
      referenceAnswer: question.reference_answer,
      transcript,
      frames,
    });

    await supabase
      .from("answers")
      .update({
        answer_score_breakdown: result.scoreBreakdown,
        answer_feedback: result.feedback,
        feedback_status: "complete",
      })
      .eq("id", answerId);

    await maybeFinalizeSession(question.session_id);
  } catch (err) {
    await supabase
      .from("answers")
      .update({
        transcript_status: "failed",
        feedback_status: "failed",
        answer_feedback: err instanceof Error ? err.message : "Processing failed",
      })
      .eq("id", answerId);

    const { data: answer } = await supabase
      .from("answers")
      .select("question_id")
      .eq("id", answerId)
      .single();
    if (answer) {
      const { data: question } = await supabase
        .from("session_questions")
        .select("session_id")
        .eq("id", answer.question_id)
        .single();
      if (question) {
        await supabase
          .from("interview_sessions")
          .update({ status: "failed" })
          .eq("id", question.session_id);
      }
    }
  }
}
