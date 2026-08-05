-- ============================================================
-- interview_sessions: new interview_type value for JD-sourced sessions,
-- so they're distinguishable in session history from generic hr_mixed
-- curated-bank sessions. Previously startLiveInterviewFromJD() hardcoded
-- 'hr_mixed' regardless of the JD's actual content, which mislabeled
-- e.g. a product-management posting as "HR Mixed" on the dashboard.
-- ============================================================
alter table public.interview_sessions
  drop constraint interview_sessions_interview_type_check;

alter table public.interview_sessions
  add constraint interview_sessions_interview_type_check
    check (interview_type in ('behavioral', 'technical', 'hr_mixed', 'company_specific', 'resume_based', 'jd_based'));
