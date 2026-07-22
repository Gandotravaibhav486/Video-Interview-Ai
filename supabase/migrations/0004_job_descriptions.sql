-- Custom job-description-based question generation: a student pastes a JD,
-- gets a private, generated question set (with reference answers generated
-- up front so scoring can ground against them), scoped to that JD only.

-- ============================================================
-- job_descriptions
-- ============================================================
create table public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  raw_text text not null,
  role text not null,
  company text,
  seniority text,
  required_skills text[] not null default '{}',
  subjects text[] not null default '{}',
  status text not null default 'ready'
    check (status in ('ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_descriptions enable row level security;

create policy "job descriptions are owned by the user"
  on public.job_descriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index job_descriptions_user_id_idx on public.job_descriptions (user_id);

-- ============================================================
-- custom_questions (private to the owning job_description/user)
-- ============================================================
create table public.custom_questions (
  id uuid primary key default gen_random_uuid(),
  job_description_id uuid not null references public.job_descriptions (id) on delete cascade,
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

alter table public.custom_questions enable row level security;

create policy "custom questions follow job description ownership"
  on public.custom_questions for all
  using (exists (
    select 1 from public.job_descriptions jd
    where jd.id = job_description_id and jd.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.job_descriptions jd
    where jd.id = job_description_id and jd.user_id = auth.uid()
  ));

create index custom_questions_job_description_id_idx on public.custom_questions (job_description_id);

-- ============================================================
-- session_questions: additive link to a custom question, mirroring the
-- existing nullable question_bank_id pattern
-- ============================================================
alter table public.session_questions
  add column custom_question_id uuid references public.custom_questions (id) on delete set null,
  add constraint session_questions_single_source
    check (question_bank_id is null or custom_question_id is null);

-- ============================================================
-- updated_at triggers, same pattern as 0001_init.sql
-- ============================================================
create trigger set_updated_at before update on public.job_descriptions
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.custom_questions
  for each row execute procedure public.set_updated_at();
