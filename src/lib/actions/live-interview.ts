"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { selectSessionQuestions } from "@/lib/questions/select";
import {
  persistInterviewSession,
  type PersistSessionQuestion,
} from "@/lib/sessions/persist-session";
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
import type { Database, InterviewType, TurnDecision } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface LaunchLiveSessionParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  role: string;
  company: string | null;
  interviewType: InterviewType;
  questions: PersistSessionQuestion[];
}

// The shared tail every source of live-interview questions (curated bank, a
// pasted JD, a resume) converges on: persist the session + its planned
// agenda, generate and persist the opening AI turn, then redirect - so the
// agent's first line is already there the moment the live page loads, with
// no extra round trip for it. Callers do only their own question
// selection/generation, then hand off here. Never returns (always redirects
// or throws), matching how each of its three call sites already behaved.
export async function launchLiveSession({
  supabase,
  userId,
  role,
  company,
  interviewType,
  questions,
}: LaunchLiveSessionParams): Promise<never> {
  const sessionId = await persistInterviewSession(supabase, {
    userId,
    role,
    company,
    interviewType,
    mode: "live",
    questions,
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

// Sources questions from the curated question_bank - backs both the
// resume-derived suggestion cards (which pass their own interview_type) and
// the manual "choose a role" form (which always sends hr_mixed, matching how
// this flow already behaved before the suggestion cards existed).
export async function startLiveInterviewFromBank(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = String(formData.get("role") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || null;
  const interviewType = String(
    formData.get("interview_type") ?? "hr_mixed"
  ) as InterviewType;
  const questionCount = Number(formData.get("question_count") ?? 6);
  const subjects = parseList(formData.get("subjects"));

  const { data: bank } = await supabase
    .from("question_bank")
    .select("*")
    .eq("is_active", true);

  const { questions, roleUnavailable, availableRoles } = selectSessionQuestions({
    bank: bank ?? [],
    role,
    companies: company ? [company] : parseList(formData.get("target_companies")),
    interviewType,
    questionCount,
    subjects: subjects.length > 0 ? subjects : undefined,
  });

  // Named separately from the generic empty case: "we don't cover this role"
  // is actionable (pick another, or paste a JD) in a way that "no questions
  // available" is not. The role and the real alternatives are passed through
  // so /interview/new can offer them as one-click choices.
  if (roleUnavailable) {
    redirect(
      `/interview/new?unavailable_role=${encodeURIComponent(
        role
      )}&available=${encodeURIComponent(availableRoles.join(","))}`
    );
  }

  if (questions.length === 0) {
    redirect(
      `/interview/new?error=${encodeURIComponent(
        "No questions available in the bank yet for this role. Ask an admin to add some."
      )}`
    );
  }

  await launchLiveSession({
    supabase,
    userId: user!.id,
    role,
    company,
    interviewType,
    questions: questions.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      question_bank_id: q.id,
    })),
  });
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

  // The model's utterance was composed for the decision it *proposed* - if
  // the state machine overrode that decision, the model's own text no longer
  // matches what's actually happening (e.g. it wrote another follow-up
  // question, but the turn cap forced an end). Reusing it verbatim showed the
  // candidate a normal-looking line right before the interview abruptly
  // stopped. Substitute a deterministic line instead - no second API call
  // needed, since the state machine already knows exactly what happened and
  // why. An override only ever resolves to end_interview or next_question,
  // never follow_up (see state-machine.ts's applyDecision).
  const utterance =
    outcome.override == null
      ? turnResult.utterance
      : outcome.decision === "end_interview"
        ? "That's all the time we have for today — thanks for taking part, we'll follow up with feedback separately."
        : `Let's move to the next question: ${agendaRows[outcome.state.questionIndex]?.question_text ?? ""}`;

  // Closing remarks belong to no single question; anything else is tagged
  // with whatever question it now addresses (the same one, on a follow-up;
  // the next one, on an advance).
  const agentTurnQuestionId =
    outcome.decision === "end_interview"
      ? null
      : agendaRows[outcome.state.questionIndex]?.id ?? null;

  // Both turns are persisted together, only now that runInterviewTurn has
  // actually succeeded - not before it's called. Inserting the candidate's
  // turn earlier left it orphaned (no agent reply) whenever the AI call
  // threw, and every retry after that sent the model two candidate/user
  // turns back to back with nothing from the agent between them - which the
  // API's strict role alternation rejects outright, turning one transient
  // failure into a permanently stuck session (confirmed live: session
  // 916c0af6's turn_index 9).
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

  const { error: agentInsertError } = await supabase.from("live_turns").insert({
    session_id: sessionId,
    session_question_id: agentTurnQuestionId,
    turn_index: candidateTurnIndex + 1,
    speaker: "agent",
    text: utterance,
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
      utterance,
      candidateTranscript: candidateText,
      done: true,
    };
  }

  return {
    utterance,
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

// Recovery path for a session whose scoring pass died mid-flight (observed
// for real: the dev server process crashed between two scoreLiveSession()
// question iterations, leaving the session on "processing" forever - nothing
// in the app otherwise ever calls scoreLiveSession() a second time). Safe to
// call on a session that's already partway scored: scoreLiveSession() skips
// any question whose answer is already "complete", so this only pays for
// the work that's actually still missing.
export async function retryLiveScoring(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("user_id, mode, status")
    .eq("id", sessionId)
    .single();
  if (!session || session.user_id !== user.id) {
    throw new Error("Session not found");
  }
  if (session.mode !== "live") {
    throw new Error("Retry is only available for live-mode sessions");
  }
  if (session.status !== "processing") {
    throw new Error("This session isn't stuck - there's nothing to retry");
  }

  after(() => scoreLiveSession(sessionId));
}
