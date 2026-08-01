"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { selectSessionQuestions } from "@/lib/questions/select";
import { persistInterviewSession } from "@/lib/sessions/persist-session";
import { transcribeAudio } from "@/lib/stt/whisper";
import {
  runInterviewTurn,
  type PlannedQuestion,
} from "@/lib/ai/interviewer";
import {
  applyDecision,
  deriveStateFromAgentDecisions,
  initialState,
} from "@/lib/interview/state-machine";
import { scoreLiveSession } from "@/lib/ai/score-live-session";
import type { TurnDecision } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Creates the session and its planned agenda (reusing the exact same curated-
// bank selection as the batch flow's createInterviewSession), then generates
// and persists the opening turn before redirecting - so the agent's first
// line is already there the moment the live page loads, with no extra round
// trip for it.
export async function startLiveInterview(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = String(formData.get("role") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || null;
  const questionCount = Number(formData.get("question_count") ?? 6);

  const { data: bank } = await supabase
    .from("question_bank")
    .select("*")
    .eq("is_active", true);

  const selected = selectSessionQuestions({
    bank: bank ?? [],
    role,
    companies: company ? [company] : parseList(formData.get("target_companies")),
    interviewType: "hr_mixed",
    questionCount,
  });

  if (selected.length === 0) {
    redirect(
      `/interview/new?error=${encodeURIComponent(
        "No questions available in the bank yet for this role. Ask an admin to add some."
      )}`
    );
  }

  const sessionId = await persistInterviewSession(supabase, {
    userId: user!.id,
    role,
    company,
    interviewType: "hr_mixed",
    mode: "live",
    questions: selected.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      question_bank_id: q.id,
    })),
  });

  const { data: agendaRows, error: agendaError } = await supabase
    .from("session_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });
  if (agendaError || !agendaRows) {
    throw new Error(agendaError?.message ?? "Failed to load the planned agenda");
  }

  const agenda: PlannedQuestion[] = agendaRows.map((q) => ({
    questionText: q.question_text,
    subject: q.subject,
    referenceAnswer: q.reference_answer,
  }));

  const opening = await runInterviewTurn({
    state: initialState(),
    agenda,
    transcript: [],
    role,
    company,
  });

  const { error: turnError } = await supabase.from("live_turns").insert({
    session_id: sessionId,
    session_question_id: agendaRows[0].id,
    turn_index: 0,
    speaker: "agent",
    text: opening.utterance,
    decision: "next_question",
    decision_rationale: opening.decisionRationale,
    coverage_notes: opening.coverageNotes,
  });
  if (turnError) throw new Error(turnError.message);

  redirect(`/interview/${sessionId}/live`);
}

export interface SubmitTurnParams {
  sessionId: string;
  audioStoragePath: string;
  audioDurationSeconds: number;
  framePaths: string[];
}

export interface SubmitTurnResult {
  utterance: string;
  /** What the candidate's audio was transcribed as - for display, so they can tell if the transcript came through correctly. */
  candidateTranscript: string;
  done: boolean;
}

// One round: transcribe what the candidate said, run the conversation pass,
// clamp its proposal through the state machine, and persist both turns.
// State is never stored separately - it's derived fresh from live_turns on
// every call via deriveStateFromAgentDecisions, so there is exactly one
// source of truth for interview position.
export async function submitTurn({
  sessionId,
  audioStoragePath,
  audioDurationSeconds,
  framePaths,
}: SubmitTurnParams): Promise<SubmitTurnResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("role, company, mode, status")
    .eq("id", sessionId)
    .single();
  if (sessionError || !session) {
    throw new Error(sessionError?.message ?? "Session not found");
  }
  if (session.mode !== "live") {
    throw new Error("This session is not a live interview");
  }
  if (session.status !== "in_progress") {
    throw new Error("This interview has already ended");
  }

  const { data: agendaRows, error: agendaError } = await supabase
    .from("session_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });
  if (agendaError || !agendaRows || agendaRows.length === 0) {
    throw new Error(agendaError?.message ?? "No planned questions for this session");
  }

  const { data: pastTurnRows, error: pastTurnsError } = await supabase
    .from("live_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });
  if (pastTurnsError) throw new Error(pastTurnsError.message);
  const ordered = pastTurnRows ?? [];

  const agentDecisions = ordered
    .filter((t) => t.speaker === "agent" && t.decision)
    .map((t) => t.decision as TurnDecision);
  const positionalState = deriveStateFromAgentDecisions(
    agentDecisions,
    agendaRows.length
  );

  // Transcribe the candidate's audio. Downloaded here (not via service role)
  // because this runs in the authenticated request itself, and the
  // recordings bucket's owner-prefix RLS already grants this user access to
  // their own path.
  const { data: audioBlob, error: downloadError } = await supabase.storage
    .from("recordings")
    .download(audioStoragePath);
  if (downloadError || !audioBlob) {
    throw new Error(downloadError?.message ?? "Could not read the recorded audio");
  }
  const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
  const candidateText = await transcribeAudio(audioBuffer, "turn.webm");

  const candidateTurnIndex = ordered.length;
  const currentQuestion = agendaRows[positionalState.questionIndex];

  const { error: candidateInsertError } = await supabase.from("live_turns").insert({
    session_id: sessionId,
    session_question_id: currentQuestion.id,
    turn_index: candidateTurnIndex,
    speaker: "candidate",
    text: candidateText,
    audio_storage_path: audioStoragePath,
    audio_duration_seconds: audioDurationSeconds,
    frames_extracted: framePaths,
  });
  if (candidateInsertError) throw new Error(candidateInsertError.message);

  const transcriptForModel = [
    ...ordered.map((t) => ({ speaker: t.speaker, text: t.text })),
    { speaker: "candidate" as const, text: candidateText },
  ];

  const agenda: PlannedQuestion[] = agendaRows.map((q) => ({
    questionText: q.question_text,
    subject: q.subject,
    referenceAnswer: q.reference_answer,
  }));

  const stateForThisTurn = {
    ...positionalState,
    turnCount: candidateTurnIndex + 1,
  };

  const turnResult = await runInterviewTurn({
    state: stateForThisTurn,
    agenda,
    transcript: transcriptForModel,
    role: session.role,
    company: session.company,
  });

  const outcome = applyDecision(
    stateForThisTurn,
    turnResult.decision,
    agendaRows.length
  );

  // Closing remarks belong to no single question; anything else is tagged
  // with whatever question it now addresses (the same one, on a follow-up;
  // the next one, on an advance).
  const agentTurnQuestionId =
    outcome.decision === "end_interview"
      ? null
      : agendaRows[outcome.state.questionIndex]?.id ?? null;

  const { error: agentInsertError } = await supabase.from("live_turns").insert({
    session_id: sessionId,
    session_question_id: agentTurnQuestionId,
    turn_index: candidateTurnIndex + 1,
    speaker: "agent",
    text: turnResult.utterance,
    decision: outcome.decision,
    decision_rationale: outcome.override
      ? `${turnResult.decisionRationale} [overridden: ${outcome.override}]`
      : turnResult.decisionRationale,
    coverage_notes: turnResult.coverageNotes,
  });
  if (agentInsertError) throw new Error(agentInsertError.message);

  if (outcome.decision === "end_interview") {
    await endLiveInterview(sessionId);
    return {
      utterance: turnResult.utterance,
      candidateTranscript: candidateText,
      done: true,
    };
  }

  return {
    utterance: turnResult.utterance,
    candidateTranscript: candidateText,
    done: false,
  };
}

// Flips the session into processing and schedules the scoring pass in the
// background - the same after()-based pattern the batch flow already uses
// for submitAnswer, so there's no new "how do background jobs run" story.
export async function endLiveInterview(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("interview_sessions")
    .update({ status: "processing" })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);

  after(() => scoreLiveSession(sessionId));
}
