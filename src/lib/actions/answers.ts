"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processAnswer } from "@/lib/ai/process-answer";

export async function submitAnswer(params: {
  questionId: string;
  videoStoragePath: string;
  videoDurationSeconds: number;
  framePaths: string[];
}) {
  const supabase = await createClient();

  const { data: answer, error } = await supabase
    .from("answers")
    .upsert(
      {
        question_id: params.questionId,
        video_storage_path: params.videoStoragePath,
        video_duration_seconds: params.videoDurationSeconds,
        frames_extracted: params.framePaths,
        transcript_status: "pending",
        feedback_status: "pending",
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "question_id" }
    )
    .select("id")
    .single();

  if (error || !answer) {
    throw new Error(error?.message ?? "Failed to save answer");
  }

  after(() => processAnswer(answer.id));

  return { answerId: answer.id };
}

export async function markSessionProcessing(sessionId: string) {
  const supabase = await createClient();
  await supabase
    .from("interview_sessions")
    .update({ status: "processing" })
    .eq("id", sessionId);
}
