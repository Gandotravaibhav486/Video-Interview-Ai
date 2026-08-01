import { createServiceRoleClient } from "@/lib/supabase/server";
import { scoreAnswer } from "@/lib/ai/scoring";
import { maybeFinalizeSession } from "@/lib/ai/finalize-session";
import { assembleQuestionMedia } from "@/lib/interview/assemble-question-media";

// The post-session scoring pass for live mode. Runs once per PLANNED
// question, not once per turn - a topic answered across an opening turn plus
// two follow-ups still produces exactly one `answers` row, via
// assembleQuestionMedia() gathering those turns back together. This is what
// lets maybeFinalizeSession() and every dashboard/aggregation path work
// completely unchanged: they only ever see "one answers row per
// session_question", batch or live.
//
// Deliberately separate from the live conversation pass (lib/ai/interviewer.ts)
// - mixing "be a natural interviewer" and "score rigorously against a rubric"
// in one call produces mediocre results at both.

export async function scoreLiveSession(sessionId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: questions, error: questionsError } = await supabase
    .from("session_questions")
    .select("id")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  if (questionsError || !questions) {
    throw new Error(questionsError?.message ?? "Failed to load session questions");
  }

  // Partial-failure tolerant, matching maybeFinalizeSession()'s existing
  // stance: one bad question (a missed turn, a transcription gap) should not
  // sink the rest of a real interview the student sat through.
  for (const question of questions) {
    try {
      await supabase.from("answers").upsert(
        {
          question_id: question.id,
          transcript_status: "processing",
          feedback_status: "processing",
        },
        { onConflict: "question_id" }
      );

      const { questionText, referenceAnswer, transcript, frames } =
        await assembleQuestionMedia({ supabase, sessionQuestionId: question.id });

      const result = await scoreAnswer({
        questionText,
        referenceAnswer,
        transcript,
        frames,
      });

      const { error: writeError } = await supabase
        .from("answers")
        .update({
          // No video in live mode - frames come from the canvas loop, not a
          // recorder, so video_storage_path stays null throughout.
          transcript,
          transcript_status: "complete",
          answer_score_breakdown: result.scoreBreakdown,
          answer_feedback: result.feedback,
          feedback_status: "complete",
          recorded_at: new Date().toISOString(),
        })
        .eq("question_id", question.id);

      if (writeError) throw new Error(writeError.message);
    } catch (err) {
      console.error(`Live scoring failed for question ${question.id}:`, err);
      await supabase
        .from("answers")
        .upsert(
          {
            question_id: question.id,
            transcript_status: "failed",
            feedback_status: "failed",
            answer_feedback:
              err instanceof Error ? err.message : "Scoring failed",
          },
          { onConflict: "question_id" }
        );
    }
  }

  await maybeFinalizeSession(sessionId);
}
