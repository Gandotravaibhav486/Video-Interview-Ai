-- Live conversational interviews: an agent conducts the interview turn by
-- turn, deciding after each answer whether to probe deeper or move on.
--
-- Purely additive. Two things it deliberately does NOT touch:
--   1. answers.question_id's UNIQUE index - one score per planned question is
--      still correct in live mode, no matter how many turns that question took.
--      The scoring pass writes exactly one answers row per session_question, so
--      maybeFinalizeSession()'s row-count check keeps working unchanged.
--   2. session_questions.reference_answer's NOT NULL - follow-up questions are
--      turns, not questions. They live in live_turns (which has no reference
--      answer column) and never become session_questions rows.

-- ============================================================
-- live_turns - the actual conversation, as opposed to the planned agenda
-- ============================================================
create table public.live_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  -- Nullable: intro and closing turns belong to the session, not to any one
  -- planned question. Everything else is tagged with the question it serves,
  -- which is what lets the scoring pass gather a topic's turns back together.
  session_question_id uuid references public.session_questions (id) on delete set null,
  turn_index int not null,
  speaker text not null check (speaker in ('agent', 'candidate')),
  text text not null,

  -- Candidate turns only. Audio, not video: frames come from the canvas loop
  -- off the live <video> element, independent of what MediaRecorder encodes,
  -- and scoreAnswer() takes transcript + frames with no video field at all.
  -- Recording video here would cost ~9x the bytes on the latency-critical
  -- upload path to buy something scoring never reads.
  audio_storage_path text,
  audio_duration_seconds numeric,
  frames_extracted jsonb not null default '[]'::jsonb,

  -- Agent turns only. decision drives the state machine; coverage_notes is
  -- carried forward into the scoring pass so the live pass's judgement of what
  -- the answer did and didn't cover isn't thrown away.
  decision text
    check (decision in ('follow_up', 'next_question', 'end_interview')),
  decision_rationale text,
  coverage_notes text,

  -- Inert seam (same pattern as answers.client_signals / integrity_flags):
  -- offsets from session start, written from day one, unused today. These are
  -- what will let a future session-long video track map "question 3" to a
  -- playback time range. Without them, sessions recorded before that ships
  -- could never have playback retrofitted.
  started_at_ms int,
  ended_at_ms int,

  created_at timestamptz not null default now()
);

alter table public.live_turns enable row level security;

-- Ownership follows the session, mirroring how custom_questions follows
-- job_descriptions.
create policy "live turns follow session ownership"
  on public.live_turns for all
  using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = live_turns.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.interview_sessions s
      where s.id = live_turns.session_id and s.user_id = auth.uid()
    )
  );

create index live_turns_session_id_idx on public.live_turns (session_id);
create index live_turns_session_question_id_idx
  on public.live_turns (session_question_id);
create unique index live_turns_session_turn_idx
  on public.live_turns (session_id, turn_index);

-- ============================================================
-- interview_sessions.mode - delivery mode, deliberately NOT a new
-- interview_type value. Live should compose with every existing content
-- source (curated bank, job description, resume), so it's an orthogonal
-- axis rather than another entry in that enum.
-- ============================================================
alter table public.interview_sessions
  add column mode text not null default 'batch'
    check (mode in ('batch', 'live'));
