import type { TurnDecision } from "@/lib/supabase/types";

// The turn-taking state machine. Pure functions, no AI and no DB - which is
// the whole point: the model *proposes* a decision each turn, this module
// *disposes*. Interview quality lives here more than in any tool schema,
// because this is what stops the agent freewheeling (probing one question
// forever, ending at question 2 of 6, running up unbounded turns).

export type InterviewPhase =
  | "intro"
  | "questioning"
  | "probing"
  | "closing"
  | "done";

export interface InterviewState {
  phase: InterviewPhase;
  /** Index into the planned agenda (session_questions, by order_index). */
  questionIndex: number;
  /** Follow-ups spent on the *current* question; resets on advance. */
  followUpsUsed: number;
  /** Every turn in the session, agent and candidate alike. */
  turnCount: number;
}

/**
 * Two probes per question is enough to test depth without turning one topic
 * into the whole interview. A third is where sessions start feeling like an
 * interrogation and the remaining agenda gets starved.
 */
export const MAX_FOLLOW_UPS_PER_QUESTION = 2;

/**
 * Absolute safety valve. With 6 questions x (1 answer + 2 follow-ups) x 2
 * speakers plus intro/closing, a legitimate session tops out around 40 turns.
 * Anything past this means something is looping, so we close out rather than
 * bill an unbounded conversation.
 */
export const MAX_TURNS = 48;

export interface DecisionOutcome {
  state: InterviewState;
  /** What actually happens - may differ from what the model asked for. */
  decision: TurnDecision;
  /**
   * Set when the model's proposal was overridden, explaining why. Persisted
   * alongside the model's own rationale so the audit trail shows both what
   * the agent wanted and what the machine allowed.
   */
  override: string | null;
}

export function initialState(): InterviewState {
  return { phase: "intro", questionIndex: 0, followUpsUsed: 0, turnCount: 0 };
}

export function isDone(state: InterviewState): boolean {
  return state.phase === "done";
}

/** Called once per persisted turn, agent or candidate. */
export function countTurn(state: InterviewState): InterviewState {
  return { ...state, turnCount: state.turnCount + 1 };
}

/**
 * Apply the model's proposed decision, clamped to the rules above.
 *
 * `totalQuestions` is the length of the planned agenda; the machine needs it
 * to know when advancing would run off the end.
 */
export function applyDecision(
  state: InterviewState,
  proposed: TurnDecision,
  totalQuestions: number
): DecisionOutcome {
  // Terminal is terminal - a late decision arriving after the interview
  // closed (double-submit, retried request) must not resurrect it.
  if (state.phase === "done") {
    return { state, decision: "end_interview", override: null };
  }

  const isLastQuestion = state.questionIndex >= totalQuestions - 1;

  // Safety valve outranks everything, including the model's own end request.
  if (state.turnCount >= MAX_TURNS) {
    return {
      state: { ...state, phase: "done" },
      decision: "end_interview",
      override:
        state.turnCount > MAX_TURNS || proposed !== "end_interview"
          ? `turn cap (${MAX_TURNS}) reached`
          : null,
    };
  }

  if (proposed === "end_interview") {
    // Ending early wastes the rest of the agenda the student came for, so a
    // premature wrap-up becomes an advance instead.
    if (!isLastQuestion) {
      return {
        state: {
          ...state,
          phase: "questioning",
          questionIndex: state.questionIndex + 1,
          followUpsUsed: 0,
        },
        decision: "next_question",
        override: `end requested at question ${state.questionIndex + 1} of ${totalQuestions}; agenda not finished`,
      };
    }
    return {
      state: { ...state, phase: "closing" },
      decision: "end_interview",
      override: null,
    };
  }

  if (proposed === "follow_up") {
    if (state.followUpsUsed >= MAX_FOLLOW_UPS_PER_QUESTION) {
      // Out of probes: advance, or close out if this was the last question.
      if (isLastQuestion) {
        return {
          state: { ...state, phase: "closing" },
          decision: "end_interview",
          override: `follow-up limit (${MAX_FOLLOW_UPS_PER_QUESTION}) reached on the final question`,
        };
      }
      return {
        state: {
          ...state,
          phase: "questioning",
          questionIndex: state.questionIndex + 1,
          followUpsUsed: 0,
        },
        decision: "next_question",
        override: `follow-up limit (${MAX_FOLLOW_UPS_PER_QUESTION}) reached on this question`,
      };
    }
    return {
      state: {
        ...state,
        phase: "probing",
        followUpsUsed: state.followUpsUsed + 1,
      },
      decision: "follow_up",
      override: null,
    };
  }

  // proposed === "next_question"
  if (isLastQuestion) {
    return {
      state: { ...state, phase: "closing" },
      decision: "end_interview",
      override: "no questions left on the agenda",
    };
  }
  return {
    state: {
      ...state,
      phase: "questioning",
      questionIndex: state.questionIndex + 1,
      followUpsUsed: 0,
    },
    decision: "next_question",
    override: null,
  };
}

/** Marks the session finished once the closing remarks have been delivered. */
export function completeClosing(state: InterviewState): InterviewState {
  return { ...state, phase: "done" };
}

/**
 * Reconstructs questionIndex/followUpsUsed/phase by replaying the state
 * machine over persisted agent decisions - so live_turns stays the single
 * source of truth for interview position, with no separate state column to
 * keep in sync.
 *
 * The very first agent decision (the opening turn, always "next_question")
 * is deliberately excluded from the replay: applyDecision's "next_question"
 * means "advance off the current question", but there is no current question
 * yet when the interview opens - replaying it would erroneously skip straight
 * to question 1. It's used only to confirm questioning starts at index 0.
 *
 * turnCount is intentionally left at 0 here - the caller sets the real count
 * separately (it needs the total number of persisted turns, agent and
 * candidate both, which this function never sees).
 */
export function deriveStateFromAgentDecisions(
  agentDecisions: TurnDecision[],
  totalQuestions: number
): InterviewState {
  let state: InterviewState = {
    phase: "questioning",
    questionIndex: 0,
    followUpsUsed: 0,
    turnCount: 0,
  };
  for (const decision of agentDecisions.slice(1)) {
    state = applyDecision(state, decision, totalQuestions).state;
  }
  return state;
}
