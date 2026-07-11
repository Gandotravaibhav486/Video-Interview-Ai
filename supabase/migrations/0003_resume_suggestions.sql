-- Resume-first onboarding: structured resume analysis + two-step onboarding gating.

alter table public.profiles
  add column resume_skills text[] not null default '{}',
  add column suggested_interviews jsonb not null default '[]'::jsonb,
  add column resume_prompted boolean not null default false,
  add column onboarding_completed boolean not null default false;
