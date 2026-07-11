-- AI Video Interview Prep App - initial schema

create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  target_role text,
  target_companies text[] not null default '{}',
  experience_level text not null default 'campus_fresher'
    check (experience_level in ('campus_fresher', 'experienced')),
  resume_url text,
  resume_parsed_summary text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are editable by owner"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

-- auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- question_bank (admin-curated, shared across all students)
-- ============================================================
create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  role_tags text[] not null default '{}',
  company_tags text[] not null default '{}',
  question_text text not null,
  reference_answer text not null,
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  question_type text not null default 'technical'
    check (question_type in ('behavioral', 'technical', 'hr', 'resume_followup')),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.question_bank enable row level security;

-- every authenticated student can read active questions to build a session
create policy "question bank is readable by authenticated users"
  on public.question_bank for select
  to authenticated
  using (is_active = true);

-- only admins may manage bank content
create policy "question bank is writable by admins"
  on public.question_bank for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create index question_bank_subject_idx on public.question_bank (subject);
create index question_bank_role_tags_idx on public.question_bank using gin (role_tags);
create index question_bank_company_tags_idx on public.question_bank using gin (company_tags);

-- ============================================================
-- interview_sessions
-- ============================================================
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  company text,
  interview_type text not null default 'hr_mixed'
    check (interview_type in ('behavioral', 'technical', 'hr_mixed', 'company_specific')),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'processing', 'completed', 'failed')),
  question_count int not null default 5,
  overall_score numeric(5, 2),
  score_breakdown jsonb not null default '{}'::jsonb,
  subject_breakdown jsonb not null default '{}'::jsonb,
  summary_feedback text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interview_sessions enable row level security;

create policy "sessions are owned by the user"
  on public.interview_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index interview_sessions_user_id_idx on public.interview_sessions (user_id);

-- ============================================================
-- session_questions
-- ============================================================
create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  question_bank_id uuid references public.question_bank (id) on delete set null,
  order_index int not null,
  question_text text not null,
  reference_answer text not null,
  subject text not null,
  question_type text not null,
  time_limit_seconds int not null default 120,
  expected_focus_areas text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.session_questions enable row level security;

create policy "session questions follow session ownership"
  on public.session_questions for all
  using (exists (
    select 1 from public.interview_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.interview_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

create index session_questions_session_id_idx on public.session_questions (session_id);
create unique index session_questions_session_order_idx
  on public.session_questions (session_id, order_index);

-- ============================================================
-- answers
-- ============================================================
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.session_questions (id) on delete cascade,
  video_storage_path text,
  video_duration_seconds numeric,
  transcript text,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'processing', 'complete', 'failed')),
  feedback_status text not null default 'pending'
    check (feedback_status in ('pending', 'processing', 'complete', 'failed')),
  answer_score_breakdown jsonb not null default '{}'::jsonb,
  answer_feedback text,
  frames_extracted jsonb not null default '[]'::jsonb,
  -- extension seams (unused in MVP, see plan doc):
  client_signals jsonb,
  integrity_flags jsonb,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.answers enable row level security;

create policy "answers follow session ownership"
  on public.answers for all
  using (exists (
    select 1 from public.session_questions q
    join public.interview_sessions s on s.id = q.session_id
    where q.id = question_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.session_questions q
    join public.interview_sessions s on s.id = q.session_id
    where q.id = question_id and s.user_id = auth.uid()
  ));

create unique index answers_question_id_idx on public.answers (question_id);

-- ============================================================
-- user_progress_view - powers dashboard trend charts
-- ============================================================
create view public.user_progress_view
with (security_invoker = true)
as
select
  s.user_id,
  s.id as session_id,
  s.role,
  s.company,
  s.interview_type,
  s.overall_score,
  s.score_breakdown,
  s.subject_breakdown,
  s.completed_at,
  param.key as parameter_key,
  (param.value ->> 'score')::numeric as parameter_score,
  subj.key as subject_key,
  (subj.value)::numeric as subject_score
from public.interview_sessions s
left join lateral jsonb_each(s.score_breakdown) as param(key, value) on true
left join lateral jsonb_each(s.subject_breakdown) as subj(key, value) on true
where s.status = 'completed';

-- ============================================================
-- updated_at helper trigger, applied to all mutable tables
-- ============================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.question_bank
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.interview_sessions
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.answers
  for each row execute procedure public.set_updated_at();
