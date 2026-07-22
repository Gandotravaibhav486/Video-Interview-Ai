-- Domain Interview: one-click, resume-grounded question generation. Unlike
-- job_descriptions/custom_questions, there's only one active resume per
-- user, so questions are scoped directly to user_id with no parent table.

-- ============================================================
-- domain_questions
-- ============================================================
create table public.domain_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  question_text text not null,
  reference_answer text not null,
  question_type text not null
    check (question_type in ('behavioral', 'technical', 'hr', 'resume_followup')),
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.domain_questions enable row level security;

create policy "domain questions are owned by the user"
  on public.domain_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index domain_questions_user_id_idx on public.domain_questions (user_id);

create trigger set_updated_at before update on public.domain_questions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- session_questions: additive link to a domain question, mirroring the
-- existing question_bank_id/custom_question_id pattern. The old 2-way
-- "at most one of two" check doesn't generalize to a 3rd column as a
-- simple OR, so it's dropped and replaced with a proper "at most one of
-- three non-null" form.
-- ============================================================
alter table public.session_questions
  add column domain_question_id uuid references public.domain_questions (id) on delete set null;

alter table public.session_questions
  drop constraint session_questions_single_source;

alter table public.session_questions
  add constraint session_questions_single_source
    check (
      (case when question_bank_id is not null then 1 else 0 end)
      + (case when custom_question_id is not null then 1 else 0 end)
      + (case when domain_question_id is not null then 1 else 0 end)
      <= 1
    );

-- ============================================================
-- interview_sessions: new interview_type value for resume-grounded
-- sessions, so they're distinguishable in session history from generic
-- hr_mixed curated-bank sessions.
-- ============================================================
alter table public.interview_sessions
  drop constraint interview_sessions_interview_type_check;

alter table public.interview_sessions
  add constraint interview_sessions_interview_type_check
    check (interview_type in ('behavioral', 'technical', 'hr_mixed', 'company_specific', 'resume_based'));
