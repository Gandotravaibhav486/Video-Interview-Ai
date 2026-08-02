-- Per-question skill tags.
--
-- `subject` is the broad bucket a question belongs to (dsa, dbms, hr) and is
-- what session selection round-robins across. `skills` is the finer-grained
-- "what is actually being tested" layer beneath it - e.g. a dbms question
-- might carry {sql, joins, normalization}, a business_analyst one
-- {stakeholder_management, requirement_gathering}.
--
-- The reason this is worth a separate column rather than more subjects: it is
-- the join key back to profiles.resume_skills, which onboarding already
-- populates from the candidate's resume. That lets Domain Interviews reuse
-- curated bank questions matching a candidate's actual claimed skills instead
-- of always generating fresh ones from the resume - the curated questions have
-- human-reviewed reference answers, which generated ones don't.
--
-- Additive and defaulted, so existing rows keep working untagged.

alter table public.question_bank
  add column skills text[] not null default '{}';

-- Skill lookups are containment queries (does this row's skills overlap the
-- candidate's?), which is what GIN indexing on an array column is for.
create index question_bank_skills_idx on public.question_bank using gin (skills);
