// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the project is linked,
// and this file can be replaced wholesale.

export type ExperienceLevel = "campus_fresher" | "experienced";
export type InterviewType =
  | "behavioral"
  | "technical"
  | "hr_mixed"
  | "company_specific";
export type SessionStatus =
  | "draft"
  | "in_progress"
  | "processing"
  | "completed"
  | "failed";
export type QuestionType =
  | "behavioral"
  | "technical"
  | "hr"
  | "resume_followup";
export type Difficulty = "easy" | "medium" | "hard";
export type ProcessingStatus = "pending" | "processing" | "complete" | "failed";
export type JobDescriptionStatus = "ready" | "failed";

export type ScoreParameter = {
  score: number;
  weight: number;
  label: string;
}

export type ScoreBreakdown = Record<string, ScoreParameter>;
export type SubjectBreakdown = Record<string, number>;

export type SuggestedInterview = {
  role: string;
  company: string | null;
  interview_type: InterviewType;
  subjects: string[];
  rationale: string;
}

export type Profile = {
  id: string;
  full_name: string | null;
  target_role: string | null;
  target_companies: string[];
  experience_level: ExperienceLevel;
  resume_url: string | null;
  resume_parsed_summary: string | null;
  resume_skills: string[];
  suggested_interviews: SuggestedInterview[];
  resume_prompted: boolean;
  onboarding_completed: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export type QuestionBankEntry = {
  id: string;
  subject: string;
  role_tags: string[];
  company_tags: string[];
  question_text: string;
  reference_answer: string;
  difficulty: Difficulty;
  question_type: QuestionType;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InterviewSession = {
  id: string;
  user_id: string;
  role: string;
  company: string | null;
  interview_type: InterviewType;
  status: SessionStatus;
  question_count: number;
  overall_score: number | null;
  score_breakdown: ScoreBreakdown;
  subject_breakdown: SubjectBreakdown;
  summary_feedback: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SessionQuestion = {
  id: string;
  session_id: string;
  question_bank_id: string | null;
  custom_question_id: string | null;
  order_index: number;
  question_text: string;
  reference_answer: string;
  subject: string;
  question_type: QuestionType;
  time_limit_seconds: number;
  expected_focus_areas: string[];
  created_at: string;
}

export type JobDescription = {
  id: string;
  user_id: string;
  raw_text: string;
  role: string;
  company: string | null;
  seniority: string | null;
  required_skills: string[];
  subjects: string[];
  status: JobDescriptionStatus;
  created_at: string;
  updated_at: string;
}

export type CustomQuestion = {
  id: string;
  job_description_id: string;
  subject: string;
  question_text: string;
  reference_answer: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  created_at: string;
  updated_at: string;
}

export type Answer = {
  id: string;
  question_id: string;
  video_storage_path: string | null;
  video_duration_seconds: number | null;
  transcript: string | null;
  transcript_status: ProcessingStatus;
  feedback_status: ProcessingStatus;
  answer_score_breakdown: ScoreBreakdown;
  answer_feedback: string | null;
  frames_extracted: string[];
  client_signals: Record<string, unknown> | null;
  integrity_flags: Record<string, unknown> | null;
  recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UserProgressRow = {
  user_id: string;
  session_id: string;
  role: string;
  company: string | null;
  interview_type: InterviewType;
  overall_score: number | null;
  score_breakdown: ScoreBreakdown;
  subject_breakdown: SubjectBreakdown;
  completed_at: string | null;
  parameter_key: string | null;
  parameter_score: number | null;
  subject_key: string | null;
  subject_score: number | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      question_bank: {
        Row: QuestionBankEntry;
        Insert: Partial<QuestionBankEntry> & {
          subject: string;
          question_text: string;
          reference_answer: string;
        };
        Update: Partial<QuestionBankEntry>;
        Relationships: [];
      };
      interview_sessions: {
        Row: InterviewSession;
        Insert: Partial<InterviewSession> & { user_id: string; role: string };
        Update: Partial<InterviewSession>;
        Relationships: [];
      };
      session_questions: {
        Row: SessionQuestion;
        Insert: Partial<SessionQuestion> & {
          session_id: string;
          order_index: number;
          question_text: string;
          reference_answer: string;
          subject: string;
          question_type: QuestionType;
        };
        Update: Partial<SessionQuestion>;
        Relationships: [];
      };
      answers: {
        Row: Answer;
        Insert: Partial<Answer> & { question_id: string };
        Update: Partial<Answer>;
        Relationships: [];
      };
      job_descriptions: {
        Row: JobDescription;
        Insert: Partial<JobDescription> & { user_id: string; raw_text: string; role: string };
        Update: Partial<JobDescription>;
        Relationships: [];
      };
      custom_questions: {
        Row: CustomQuestion;
        Insert: Partial<CustomQuestion> & {
          job_description_id: string;
          subject: string;
          question_text: string;
          reference_answer: string;
          question_type: QuestionType;
        };
        Update: Partial<CustomQuestion>;
        Relationships: [];
      };
    };
    Views: {
      user_progress_view: {
        Row: UserProgressRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
