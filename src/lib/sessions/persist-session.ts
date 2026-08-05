import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  InterviewType,
  QuestionType,
  SessionMode,
} from "@/lib/supabase/types";

const DEFAULT_TIME_LIMIT_SECONDS = 120;

export interface PersistSessionQuestion {
  question_text: string;
  reference_answer: string;
  subject: string;
  question_type: QuestionType;
  question_bank_id?: string | null;
  custom_question_id?: string | null;
  domain_question_id?: string | null;
}

export interface PersistSessionParams {
  userId: string;
  role: string;
  company: string | null;
  interviewType: InterviewType;
  questions: PersistSessionQuestion[];
  /**
   * Defaults to "batch" for the enum's historical value - every session
   * created going forward passes "live" explicitly via launchLiveSession().
   */
  mode?: SessionMode;
}

// Called from launchLiveSession() (src/lib/actions/live-interview.ts), the
// shared tail for every source a live interview can be started from
// (curated bank, a pasted JD, a resume) - the interview_sessions +
// session_questions insert shape is identical regardless of source, only the
// question source and FK field differ.
export async function persistInterviewSession(
  supabase: SupabaseClient<Database>,
  { userId, role, company, interviewType, questions, mode = "batch" }: PersistSessionParams
): Promise<string> {
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .insert({
      user_id: userId,
      role,
      company,
      interview_type: interviewType,
      mode,
      status: "in_progress",
      question_count: questions.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message ?? "Failed to create session");
  }

  const { error: questionsError } = await supabase.from("session_questions").insert(
    questions.map((q, index) => ({
      session_id: session.id,
      question_bank_id: q.question_bank_id ?? null,
      custom_question_id: q.custom_question_id ?? null,
      domain_question_id: q.domain_question_id ?? null,
      order_index: index,
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      time_limit_seconds: DEFAULT_TIME_LIMIT_SECONDS,
    }))
  );

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  return session.id;
}
