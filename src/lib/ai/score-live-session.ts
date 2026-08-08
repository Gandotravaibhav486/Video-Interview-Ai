import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { scoreAnswer } from "@/lib/ai/scoring";
import { maybeFinalizeSession } from "@/lib/ai/finalize-session";
import { assembleQuestionMedia } from "@/lib/interview/assemble-question-media";
import type { Database } from "@/lib/supabase/types";

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
  //
  // Also idempotent per question, which is what makes this function safe to
  // call again for a session that's already partway done - the dev server
  // crashing mid-loop (observed for real: killed between question 0
  // finishing and question 1 completing, leaving question 1 frozen on
  // "processing" forever with nothing to ever call this function again)
  // previously had no recovery path at all. Re-running from scratch would
  // have re-spent an API call re-scoring question 0 for nothing; skipping
  // already-complete questions makes a retry cheap and safe.
  for (const question of questions) {
    try {
      const { data: existing } = await supabase
        .from("answers")
        .select("feedback_status")
        .eq("question_id", question.id)
        .maybeSingle();
      if (existing?.feedback_status === "complete") continue;

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
  await purgeSessionFrames(supabase, sessionId);
}

/**
 * Deletes a session's sampled frames once every question has been scored.
 *
 * Frames exist only to feed scoreAnswer()'s vision rubric. Nothing renders
 * them afterwards - the results page reads transcripts, scores and feedback
 * (all DB columns) and never touches the `frames` bucket - so once scoring is
 * complete they are pure storage cost. At ~1.9MB per live session against a
 * 1GB bucket that is roughly 1.5% of total capacity burned per interview,
 * forever, for bytes nothing will ever read again.
 *
 * Two deliberate constraints:
 *
 * 1. Only purges when EVERY question reached feedback_status 'complete'. A
 *    partially-failed session is exactly the case retryLiveScoring() exists
 *    to recover, and that retry re-runs assembleQuestionMedia() - deleting
 *    the frames first would silently downgrade the retry to a transcript-only
 *    score.
 * 2. Best-effort. Scoring has already succeeded and been finalized by this
 *    point; a storage hiccup must not turn a completed interview into a
 *    failed one. Worst case the frames linger and the retention sweep gets
 *    them later.
 *
 * `live_turns.frames_extracted` is left populated as the record of what was
 * captured. That is safe because gatherFrames() drops a frame it cannot
 * download rather than throwing, so any future reader degrades to
 * transcript-only rather than breaking.
 */
export async function purgeSessionFrames(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<number> {
  try {
    const { data: questions } = await supabase
      .from("session_questions")
      .select("id")
      .eq("session_id", sessionId);
    if (!questions?.length) return 0;

    const { data: answers } = await supabase
      .from("answers")
      .select("question_id, feedback_status")
      .in(
        "question_id",
        questions.map((q) => q.id)
      );

    const allComplete =
      answers?.length === questions.length &&
      answers.every((a) => a.feedback_status === "complete");
    if (!allComplete) return 0;

    const { data: turns } = await supabase
      .from("live_turns")
      .select("frames_extracted")
      .eq("session_id", sessionId);

    const paths = (turns ?? []).flatMap((t) => t.frames_extracted ?? []);
    if (paths.length === 0) return 0;

    const { error } = await supabase.storage.from("frames").remove(paths);
    if (error) {
      console.error(`Frame purge failed for session ${sessionId}:`, error.message);
      return 0;
    }
    return paths.length;
  } catch (err) {
    console.error(`Frame purge failed for session ${sessionId}:`, err);
    return 0;
  }
}
