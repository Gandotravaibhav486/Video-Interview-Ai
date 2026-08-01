import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LiveTurn } from "@/lib/supabase/types";
import type { FrameImage, ScoreAnswerParams } from "@/lib/ai/scoring";

// Bridges live mode's turn-by-turn conversation back to batch mode's
// unchanged scoreAnswer(). A planned question can be answered across an
// opening turn plus up to 2 follow-ups (src/lib/interview/state-machine.ts);
// this gathers those turns into exactly the four fields scoreAnswer() takes.
//
// scoreAnswer()'s own body needs no changes for live mode - only a new
// caller. It never sees video (frames come from the canvas loop, not the
// recorder), so this module has no video-handling to do either.

const MAX_FRAMES = 8;

export interface AssembleQuestionMediaParams {
  supabase: SupabaseClient<Database>;
  sessionQuestionId: string;
}

export async function assembleQuestionMedia({
  supabase,
  sessionQuestionId,
}: AssembleQuestionMediaParams): Promise<ScoreAnswerParams> {
  const { data: question, error: questionError } = await supabase
    .from("session_questions")
    .select("question_text, reference_answer")
    .eq("id", sessionQuestionId)
    .single();
  if (questionError || !question) {
    throw new Error(
      questionError?.message ?? `session_question ${sessionQuestionId} not found`
    );
  }

  const { data: turns, error: turnsError } = await supabase
    .from("live_turns")
    .select("*")
    .eq("session_question_id", sessionQuestionId)
    .order("turn_index", { ascending: true });
  if (turnsError) throw new Error(turnsError.message);

  const ordered = (turns ?? []) as LiveTurn[];
  const agentTurns = ordered.filter((t) => t.speaker === "agent");
  const candidateTurns = ordered.filter((t) => t.speaker === "candidate");

  // The agent's turns for this question are the opening ask plus whatever
  // follow-ups it chose to spend - concatenating them naturally reproduces
  // "what was really asked", not just the original question text.
  const questionText =
    agentTurns.length > 0
      ? agentTurns.map((t) => t.text).join(" ")
      : question.question_text;

  // Label each candidate turn so a multi-turn answer stays legible to the
  // scoring model rather than reading as one run-on paragraph.
  const transcript = candidateTurns
    .map((t, i) =>
      i === 0 ? `Answer: ${t.text}` : `Follow-up answer ${i + 1}: ${t.text}`
    )
    .join("\n\n");

  const frames = await gatherFrames(supabase, candidateTurns);

  return {
    questionText,
    referenceAnswer: question.reference_answer,
    transcript,
    frames,
  };
}

/**
 * Union of every candidate turn's sampled frames for this question, evenly
 * spread across turns rather than front-loaded on the first one, then capped
 * at MAX_FRAMES. Cost matters here: at high-res vision pricing each image can
 * run ~4.7K tokens, so an uncapped multi-turn topic (e.g. 3 turns x 6 frames
 * = 18 images) would dominate the scoring call's latency and cost on its own.
 */
async function gatherFrames(
  supabase: SupabaseClient<Database>,
  candidateTurns: LiveTurn[]
): Promise<FrameImage[]> {
  const perTurnPaths = candidateTurns.map((t) => t.frames_extracted ?? []);

  const selectedPaths: string[] = [];
  let round = 0;
  while (selectedPaths.length < MAX_FRAMES) {
    let pickedAny = false;
    for (const paths of perTurnPaths) {
      if (selectedPaths.length >= MAX_FRAMES) break;
      if (round < paths.length) {
        selectedPaths.push(paths[round]);
        pickedAny = true;
      }
    }
    if (!pickedAny) break;
    round += 1;
  }

  const frames: FrameImage[] = [];
  for (const path of selectedPaths) {
    const { data: blob, error } = await supabase.storage
      .from("frames")
      .download(path);
    // A missing frame is dropped, not fatal - matches process-answer.ts's
    // existing tolerance for per-frame download failures.
    if (error || !blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    frames.push({ base64: buffer.toString("base64"), mediaType: "image/jpeg" });
  }

  return frames;
}
