# Task scheduler

A running to-do list for building/maintaining this product. Add to it any
time; say **"clean"** in chat to get it reviewed and triaged.

## How to add a task

Append a line under **Pending**, in whatever shape is convenient:

```
- [ ] Fix the live-interview timer drift !urgent
- [ ] Run tier-2 placement-matrix pairings (due 2026-08-10)
- [ ] Write up the chat-vs-API cost comparison once dream11 reruns
```

- `!urgent` / `!high` / `!low` — optional priority tag, anywhere in the line.
- `(due YYYY-MM-DD)` — optional deadline.
- No tag at all is fine — untagged tasks are triaged on judgment (blocking
  other work, how stale, how much it costs to leave undone) rather than
  ignored.

No fixed format is enforced. A messy one-line brain dump is fine; the "clean"
step is exactly where it gets straightened out.

## What "clean" means

When the user says **"clean"** (in this file's context — i.e. about their
to-do list, not e.g. "clean up this function"), do all of the following:

1. **Read every item currently under Pending.**
2. **Verify status, don't trust checkboxes blindly.** For each item, check
   whether it's actually done already — via `git log`, current file/DB state,
   or by asking the user if it's genuinely ambiguous. A task can be typed as
   pending and be stale (already shipped in a later commit) or the reverse
   (checked off but not actually verified).
3. **Move confirmed-done items to Done**, each with the date resolved, and a
   one-line note of what actually happened (not just a restated title) so the
   Done log stays useful as a changelog, not just a graveyard of checkboxes.
4. **Rank the remaining pending items** by combining: explicit priority tags,
   deadlines (nearer = more urgent), whether the item blocks other pending
   work, and how much cost/risk accrues the longer it sits (a broken
   production path outranks a nice-to-have regardless of tags).
5. **Show the top 3** directly in chat — not just silently rewritten into the
   file. One line each: what it is, why it's in the top 3 right now. The full
   triaged list stays in this file; chat gets the distilled version.
6. **Rewrite this file's Pending/Done sections** to reflect the above, so the
   next "clean" starts from a clean state rather than re-deriving everything.

This file is self-contained by design — a brand-new conversation with no
memory of past sessions should be able to read it and run "clean" correctly
without any other context.

## Pending

*Last cleaned: 2026-08-06 (second run today, after the tier-2 question-bank
load, the company-matching fix, the storage cleanup and the docs pass. Every
pending item below was re-verified against code or the live database and all
are genuinely still open — nothing moved to Done in this pass. Corrected two
stale bank counts (498 → 728) and split the duplicate-`0008` migration into
its own item, since it blocks the next migration rather than the docs.)*

- [ ] Live-interview UX fixes !high — **half of this landed in `c759afe`**;
      the two remaining sub-items are: (1) group the question agenda by
      section instead of interleaving subjects — `roundRobinBySubject` is
      still the only selector in use across `select.ts`,
      `job-descriptions.ts`, and `domain-interview.ts`, so openers like
      "tell me about yourself" can still land last; (2) auto-start recording
      + a ~60s visible timer + an audible chime + transcript auto-scroll in
      `live-interview-flow.tsx` — verified absent, that file still has only
      the manual "Start answering" button with no time bound at all, so a
      candidate can sit indefinitely on a question. Full spec:
      `~/.claude/plans/i-want-to-explore-twinkling-cocoa.md`.
- [ ] Add a second prompt-cache breakpoint on the live interviewer's growing
      conversation history — found during the cost analysis: the static
      system prompt caches correctly (confirmed via real usage data), but
      `messages[]` has no `cache_control` at all, so the whole transcript is
      re-billed at full price every turn. That's why live-mode cost nearly
      doubled per-turn across a session (see `operating-cost-analysis.md`).
      Concrete, low-risk (pure cost optimization, no behavior change) - worth
      doing alongside the UX fixes above since both touch the same file.
- [ ] Test the UI & make it better on mobile phones — completely unverified so
      far. Webcam capture + MediaRecorder are exactly the APIs that break
      silently on mobile Safari/Chrome (autoplay policies, permission flows,
      codec support), and campus students plausibly interview from a phone.
- [ ] Pressure-test Groq Whisper transcripts and find where it falters — no
      transcription-quality check has been done all project. A bad transcript
      silently degrades scoring in both batch and live mode with no visible
      error anywhere in the pipeline.
- [ ] Prototype moving the live interviewer (`runInterviewTurn`) from Opus 5
      to Sonnet 5, with state injection restructured into a user-turn block
      instead of a mid-conversation system message (Sonnet doesn't support
      that message type - see `interviewer.ts:11-14`). The single biggest
      cost lever found in the analysis (~2.5x cheaper, and this is ~90% of
      live mode's cost premium over batch) - but real regression risk to
      tool-call reliability, which is why Opus was chosen originally. Do
      this after the UX-fixes and cache-breakpoint items above, not
      alongside them - don't stack an architecture change on top of an
      already-buggy live flow.
- [ ] Live interview currently only shows transcript, doesn't feel like an
      interactive interviewer, and the recorder view has no maximize/fullscreen
      option — flagged as a design decision still to be made (text vs. voice),
      not a bug to just fix. Worth deciding alongside the UX fixes above since
      both touch `live-interview-flow.tsx`, but kept separate here since this
      one needs a product decision first, not just implementation.
- [ ] Retry-on-transient-failure for question-bank generation — a bare network
      error currently kills a pairing outright and discards the (paid-for)
      research pass. Flagged twice, never added to the real pipeline (only
      to throwaway verification scripts). Do this before the tier-2 run below,
      or risk repeating the exact wasted-spend failure that hit `dream11`.
      Same class of gap as the live-interview orphaned-turn bug fixed in
      `c759afe`: an AI call that throws mid-flow leaves partial state behind.
- [ ] Re-run `product_manager @ dream11` — still outstanding; confirmed
      2026-08-06 that the bank has 0 rows carrying a `dream11` company tag
      (re-confirmed after the tier-2 load, 728 rows total), so nothing from
      this pairing ever landed.
- [ ] Run tier-2 placement-matrix pairings — **23 of 61 done** as of
      2026-08-06 (loaded from the user's separate generation chat; see the
      Done entry below). **38 left**, split by category: it_services 9,
      global_product 8, finance 7, core_engineering 6, indian_product 4,
      consulting_analytics 4. Roles still entirely absent from the bank:
      `qa_engineer`, `technical_support`, `data_engineer`, `network_engineer`,
      `quant_analyst`, `mechanical_engineer`, `civil_engineer`,
      `electrical_engineer`, `consultant`. `pairingsByPriority(2)` in
      `src/lib/questions/placement-matrix.ts`; chat workflow in
      `workflows/question-bank-generation.md` (run by hand in chat, as tier 1
      was — zero marginal cost, and the API path can't fit a pairing inside
      the 300s serverless ceiling anyway). **User is running this themselves
      in a separate chat.** When the next batch lands, note that the generator
      sometimes names files/roles by placement-matrix *category*
      (`global_product`/`indian_product`/`consulting_analytics`) rather than by
      role — those must be remapped to the real role before insert, or
      `select.ts`'s `tagMatches()` can never reach them.
- [ ] Clean up 8 bank questions whose own verifier flagged defects in the
      question *text* (the verdict `reason` fields say so, but only the verdict
      enum is stored, so these notes are otherwise lost). Most leak research /
      process commentary — the interviewer narrating the company's own hiring
      process back at the candidate, which reads oddly in a live interview.
      Editable via the admin question-bank page: `sde@cisco` ("Cisco hires into
      two distinct fresher tracks..."), `sde@salesforce` ("Salesforce's final
      round has included a 'paper coding' component..."), `sde@samsung` (two:
      "Samsung's interviews are known for probing projects in real depth...",
      "Samsung's coding assessment can run up to 3 hours..."), `sde@tcs`
      ("TCS's technical rounds cover topics like Cloud Computing..."),
      `analyst@capgemini` ("Even in a non-coding-heavy Analyst role..."),
      `systems_engineer@tcs` (stray "without writing code on a screen").
      Also `sde@jp_morgan`'s sliding-window question is tagged `hard` against a
      documented easy-to-medium bar and should be recalibrated. 4 of the 8 came
      in with the tier-2 drop; the other 4 have been in the bank since tier 1.
      (The 9th — `sde@infosys`'s false-premise stem — was fixed 2026-08-06.)
- [ ] Refine the documentation in `docs/` — first pass written 2026-08-06
      (`README.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`) using the
      `documentation` skill. It's accurate as of today and every internal link
      resolves, but it was written in one pass from one person's context, so:
      (1) **read it as a newcomer** — the ARCHITECTURE turn-loop and
      "model proposes, code disposes" sections assume more familiarity than a
      first-time reader has; (2) **add diagrams** — the turn loop and the
      turns→answers assembly are both easier to see than to read, and there's
      currently only one ASCII flow; (3) **decide what happens to the loose
      root-level markdown** (`video-ai-brain.md`, `financial-analysis.md`,
      `operating-cost-analysis.md`, `article-*.md`) — some belongs in `docs/`,
      some is private and should stay untracked, and right now the split is
      accidental rather than chosen; (4) **the RUNBOOK's storage section
      references a walk-the-bucket script that only exists in chat history** —
      commit it as a real script under `scripts/` and link it; (5) re-check the
      "Known limitations" list in ARCHITECTURE against reality before showing
      the docs to anyone, since several items are actively being worked on and
      will go stale fastest.
- [ ] Renumber the **duplicate `0008` migration** — both
      `0008_jd_based_interview_type.sql` and `0008_question_bank_skills.sql`
      exist and are applied, so the numbering no longer conveys order. Harmless
      today, actively misleading the moment anyone writes `0009` or replays the
      migrations against a fresh database. Renaming an applied file is safe (the
      database is the source of truth, not the file), but check which was
      actually applied first before picking the new number. Flagged in
      `docs/RUNBOOK.md`.
- [ ] Run tier-3 placement-matrix pairings (36) — same file, `pairingsByPriority(3)`.
- [ ] Backfill `skills` tags on the original 23 manually-written questions —
      re-confirmed 2026-08-06 after the tier-2 load: still 0/23 manual rows
      tagged, and the bank is now 728 rows, so the hand-written questions are
      an ever-shrinking fraction that Domain Interview's resume-skill matching
      can never surface.
- [ ] Pressure test the interview rounds, or build a workflow to test questions
      for each interview round (note: the video/webcam portion itself can't
      be exercised by AI, so this is necessarily a partly-manual check).
- [ ] Live interview: add an option to change target role for a person through
      profile settings — depends on the profile section below existing first.
- [ ] Create a profile section: personal details, resume update option, and a
      way to download reports for all past interviews.
- [ ] Improve the app's design/UI and make decisions on buttons and overall
      appearance.
- [ ] Create a list of basic tests to run each time a new feature is added to
      the web app — a process/checklist item, not tied to any specific bug.
- [ ] Research current advancements in AI agents re: interviews — via papers
      and other startups — and use it to surface more research directions.

## Done

- [x] Company tag matching no longer collides across word boundaries —
      (2026-08-06) `9f8a774`. `tagMatches()` tested raw substrings both ways,
      so `ey` matched `mckinsey` and EY's questions leaked into McKinsey
      interviews (found while verifying the tier-2 drop). Added a separate
      `companyMatches()` comparing whole underscore-separated tokens, keeping
      the free-text tolerance that matters ("Texas Instruments" →
      `texas_instruments`, "Amazon India" → `amazon`) while making a mid-word
      collision impossible. Role matching deliberately left loose. Verified
      against the real 728-row bank: mckinsey/ey/zomato/texas_instruments
      selections all return only their own company's questions.
- [x] Fixed the `sde@infosys` false-premise question — (2026-08-06) the stem
      opened "You mentioned the coding round includes basic dynamic
      programming problems," asserting something the candidate never said,
      which would have derailed a live interview. Trimmed to the actual
      question; the reference answer needed no change. Swept the whole bank
      for similar stems ("you mentioned" / "as you said" / "you told me") —
      no others.
- [x] Tier-2 question-bank drop loaded (23 of 61 pairings) — (2026-08-06)
      **230 questions inserted**, bank grew 498 → 728 rows. The user supplied
      180 files (60 pairings × research/questions/verdicts) from a separate
      generation chat; only 23 pairings were actually new. Three things had to
      be resolved before insert, all verified against the live bank rather
      than assumed: (1) **28 of the 60 pairings were the tier-1 batch already
      loaded on 2026-08-02** — exact question-text comparison confirmed 280
      questions were already present, so inserting the lot would have created
      280 duplicates; (2) **9 file pairs held byte-identical question sets**
      under two different names (e.g. `sde_amazon` == `global_product_amazon`),
      deduped keeping the role-named copy; (3) **32 files were tagged with a
      placement-matrix *category* as the role** (`global_product` etc.), which
      `select.ts`'s `tagMatches()` can never match against a real role — each
      was remapped to the role the matrix defines for that company. Verified
      after insert: 0 rows still carry a category as a role, and
      `selectSessionQuestions` returns correct company-scoped mixes for the new
      pairings. Verifier note: **0 of 600 questions were rejected** (408
      grounded / 192 plausible), which is the "verifier too lenient" signal the
      original plan flagged — though 11 verdict *reasons* do flag real text
      defects (see the pending item about those).
- [x] Vercel production builds unblocked — (2026-08-06) `e39c406`. Discovered
      while confirming a deploy: `maxDuration = 800` on the question-bank page
      exceeds the Hobby plan's hard 300s ceiling, which **fails the build**
      rather than clamping. Every production deploy had been failing silently
      since `895e2c4` (2026-08-02), so `mockintervew.com` was serving stale
      code for four days without anyone noticing. Capped at 300; deploy
      confirmed Ready. Lesson worth keeping: a green local build says nothing
      about Vercel's build-time validation.
- [x] Consolidate interview creation into one live-only entry point —
      (2026-08-05) `c759afe`. Four entry points collapsed into a single
      `/interview/new` offering three content sources (bank role, pasted JD,
      resume); batch mode and its whole recording/scoring path deleted
      (~1,078 lines). Verified live before push.
- [x] Live interview: orphaned candidate turn caused permanently stuck
      sessions — (2026-08-05) `c759afe`. `submitTurn()` persisted the
      candidate's `live_turns` row *before* calling the interviewer, so a
      transient Anthropic 400 left it with no agent reply — and every retry
      then sent two consecutive user-role messages, violating strict role
      alternation and 400-ing again forever. Both inserts now happen only
      after the AI call succeeds; the stuck production session was unstuck by
      deleting its orphaned turn and went on to complete normally.
- [x] Live-interview UX fixes, sub-items 1 & 2 of 4 — (2026-08-05) `c759afe`.
      Override-substituted utterances (the state machine's decision no longer
      shows the model's mismatched line before an abrupt end) and
      `maxTurnsFor(totalQuestions)` replacing the flat 48-turn cap. Sub-items
      3 & 4 remain in Pending above.
- [x] JD-sourced sessions no longer mislabeled "HR Mixed" — (2026-08-06)
      `84fc0f2` + migration `0008`. Added a real `jd_based` interview type
      (mirroring `resume_based`) and backfilled the 8 existing JD-sourced
      sessions in prod; dashboard now reads "Job Description" for them.
- [x] Show target role on the resume-based interview card — (2026-08-06)
      `5966c39`. The "Use my resume" card gave no hint what role the questions
      would be framed around.
- [x] Financial analysis sheet — (2026-08-03) created `financial-analysis.md`
      with real confirmed figures: Claude Pro $20/mo × 4 = $80 build cost;
      `mockintervew.*` domains ₹7,636/yr ($80.04); Vercel/Supabase $0;
      revenue $0 with a target to start by ~2026-09-03. Still has open gaps
      tracked inside that file itself (3 unseen domain-registrar rows,
      whether the personal domains route to this app, no revenue pricing
      model yet) - not re-listed here since the file already tracks them.
- [x] Operating cost analysis — (2026-08-03) real measured (not estimated)
      per-interview cost: batch $0.12, live $0.31 - live is 2.6x batch.
      Found prompt caching works correctly on the interviewer's system
      prompt, but the growing conversation history has no cache breakpoint
      and is re-billed in full every turn - that's the actual driver of
      live mode's cost, not a caching failure. Concluded local/open models
      aren't the highest-leverage fix (STT is already cheap, scoring is too
      quality-critical to risk); a Sonnet-5 swap for the live interviewer is
      the bigger lever. Two concrete follow-ups derived into Pending above.
      See `operating-cost-analysis.md`.
- [x] Tier-1 placement-matrix pairings (28/28) — (2026-08-02) generated by
      hand in chat per `workflows/question-bank-generation.md`, Pass 4
      applied: 280 questions, 204 grounded / 76 plausible / 0 rejected.
- [x] Question-bank generation pipeline + provenance/skill columns —
      (2026-08-02) committed (`895e2c4`).
- [x] LocalTimestamp hydration mismatch — (2026-08-02) committed (`5fdb052`).
- [x] Live-interview turn-tagging off-by-one fix — (2026-08-01) committed
      (`2ca16bb`): the interviewer wasn't told the next question's text, so it
      improvised one, causing every question after the first to be one slot
      behind its real bank text.
