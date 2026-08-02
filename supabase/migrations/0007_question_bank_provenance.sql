-- Provenance for AI-generated question bank entries.
--
-- The bank is being expanded from a hand-seeded 23 rows to broad role x
-- company coverage via a research -> generate -> verify pipeline. These
-- columns record where a question came from and whether a separate
-- verification pass judged it actually grounded in how that company/role
-- interviews - so the bank stays auditable rather than becoming a pile of
-- plausible-looking invented questions.
--
-- Purely additive and fully defaulted: the existing 23 hand-written rows
-- become source='manual' with null verdicts, and the admin CRUD page keeps
-- working with no changes.

alter table public.question_bank
  add column source text not null default 'manual'
    check (source in ('manual', 'ai_generated')),

  -- What the research pass found for this role+company pairing (round
  -- structure, subject emphasis, style) plus its sources. Null for manual rows.
  add column grounding_notes text,

  -- The separate verifier's call. 'rejected' questions are never inserted -
  -- this column exists so a later admin review UI can distinguish a question
  -- specifically evidenced for that company ('grounded') from one that is
  -- merely reasonable for the role in general ('plausible').
  add column verification_verdict text
    check (verification_verdict in ('grounded', 'plausible', 'rejected')),

  add column verified_at timestamptz;
