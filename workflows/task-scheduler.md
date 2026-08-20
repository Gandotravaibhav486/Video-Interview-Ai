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

*Last cleaned: 2026-08-20, after the editorial redesign, the guided onboarding
rewrite, the role-matching fix and two rounds of mobile work. Every item below
was re-verified against code or the live database. Three items moved to Done;
the mobile item was **split** (its layout half is done and verified on a real
handset, its webcam half is untested and stays open). Five new items were
added, all found while doing other work. The company-filter bug surfaced by
this triage was fixed in the same pass — see Done.*

- [ ] **Verify the new onboarding actually converts** !high — 3 of 7 profiles
      (Akshun Jain, Suraj Phanindra, Jyotsna) never got past the old first
      screen, all with `resume_prompted = false`, meaning neither the required
      file input nor the skip button was ever submitted. The 6-step rewrite
      shipped 2026-08-20 (`5f5bdd0`) moves the resume ask to last, but **no real
      signup has been through it yet** — a new user (Mario, 2026-08-15) arrived
      during that work. Watch the next few signups; if `onboarding_completed`
      still stalls, the redesign treated the wrong cause.
- [ ] Live-interview UX fixes !high — re-verified 2026-08-20, both sub-items
      still absent (0 matches for timer/auto-record/chime/autoscroll in
      `live-interview-flow.tsx`, and `selectGroupedBySection` does not exist):
      (1) group the agenda by section instead of interleaving subjects —
      `roundRobinBySubject` is still the only selector, so an opener like "tell
      me about yourself" can land last; (2) auto-start recording + a ~60s visible
      timer + an audible chime + transcript auto-scroll — a candidate can still
      sit indefinitely on a question with no time bound at all. Full spec in
      `~/.claude/plans/i-want-to-explore-twinkling-cocoa.md`.
- [ ] **Mobile: the webcam/capture path is still completely untested** !high —
      the *layout* half of the old mobile item is done (see Done). This is the
      half that actually matters and none of it has been exercised: `getUserMedia`,
      `MediaRecorder`, the canvas frame loop and the permission flow are exactly
      the APIs that fail silently on mobile Safari/Chrome, and campus students
      plausibly interview from a phone. Needs a real handset — emulation cannot
      test camera, mic, or autoplay policy.
- [ ] Add a second prompt-cache breakpoint on the live interviewer's growing
      conversation history — re-confirmed 2026-08-20: `interviewer.ts` has
      exactly one `cache_control`, on the static system prompt. `messages[]` has
      none, so the whole transcript is re-billed at full price every turn. That
      is the actual driver of live mode's per-turn cost climb across a session
      (`operating-cost-analysis.md`). Pure cost optimisation, no behaviour change.
- [ ] Retry-on-transient-failure for question-bank generation — a bare network
      error still kills a pairing outright and discards the paid-for research
      pass. Flagged twice, never added to the real pipeline. Do this before the
      tier-2 run below, or repeat the wasted spend that hit `dream11`.
- [ ] **Consulting coverage is 10 questions and every one is tagged `bain`**
      !high — sharpened 2026-08-20 after the company-preference fix. There are
      exactly 10 `associate_consultant` rows, all `{"bain": 10}`, and 0 tagged
      `mckinsey` for that role. So a McKinsey consulting interview still gets
      "Why Bain specifically, among the other top strategy consulting firms?" —
      the selection code is now doing the right thing and the *data* is the
      remaining gap. Worse than a generic question, because it names a
      competitor. Note the bank has **zero company-agnostic rows** (all 728
      carry a company tag), so top-up can never fall back to neutral questions;
      generating firm-neutral consulting questions would fix the whole class.
      `sde` has 313 rows for comparison.
- [ ] Re-run `product_manager @ dream11` — re-confirmed 2026-08-20: still 0 rows
      carrying a `dream11` company tag across 728 active rows.
- [ ] Run tier-2 placement-matrix pairings — 23 of 61 done, **38 left**:
      it_services 9, global_product 8, finance 7, core_engineering 6,
      indian_product 4, consulting_analytics 4. Roles still entirely absent:
      `qa_engineer`, `technical_support`, `data_engineer`, `network_engineer`,
      `quant_analyst`, `mechanical_engineer`, `civil_engineer`,
      `electrical_engineer`, `consultant`. **User is running this themselves in a
      separate chat.** Note the generator sometimes names files by placement-matrix
      *category* rather than role — those must be remapped before insert, or
      `select.ts` can never reach them.
- [ ] Clean up 8 bank questions whose own verifier flagged defects in the question
      *text* — most leak research/process commentary (the interviewer narrating the
      company's hiring process back at the candidate). Editable via the admin page:
      `sde@cisco`, `sde@salesforce`, `sde@samsung` (×2), `sde@tcs`,
      `analyst@capgemini`, `systems_engineer@tcs`; plus `sde@jp_morgan`'s
      sliding-window question mis-tagged `hard`.
- [ ] Pressure-test Groq Whisper transcripts and find where it falters — still no
      transcription-quality check all project. A bad transcript silently degrades
      scoring with no visible error anywhere in the pipeline.
- [ ] Prototype moving `runInterviewTurn` from Opus 5 to Sonnet 5, with state
      injection restructured into a user-turn block (Sonnet doesn't support the
      mid-conversation system message — `interviewer.ts:11-14`). Biggest single
      cost lever (~2.5x), but real regression risk to tool-call reliability. Do
      after the UX fixes and cache breakpoint, not alongside — don't stack an
      architecture change on an already-buggy live flow.
- [ ] Live interview: transcript-only view doesn't feel like an interviewer, and
      the recorder has no maximize/fullscreen — a product decision (text vs.
      voice) before it's an implementation task.
- [ ] Renumber the duplicate `0008` migration — re-confirmed 2026-08-20: both
      `0008_jd_based_interview_type.sql` and `0008_question_bank_skills.sql` still
      exist and are applied. Harmless until someone writes `0009` or replays
      against a fresh database. Check which was applied first before renaming.
- [ ] Backfill `skills` tags on the 23 manually-written questions — re-confirmed
      2026-08-20: still **0 of 23** tagged, against a 728-row bank, so the
      hand-written questions are an ever-shrinking fraction that Domain Interview's
      resume-skill matching can never surface.
- [ ] `Input` is 32px tall on mobile (`h-8`) — under the 44px tap-target floor.
      Left alone deliberately on 2026-08-20: it's the shadcn primitive behind every
      form in the app, so `h-11 sm:h-8` touches login, signup, the role/company/count
      fields and resume upload at once. Wants its own review, not a drive-by.
- [ ] `autoFocus` on three onboarding steps may fight the mobile keyboard — on a
      handset it pops the keyboard on mount, which collapses `dvh` and reflows a
      `min-h-dvh` layout mid-transition. Flagged as the standard failure mode but
      **not observed** — needs the same phone the mobile screenshots came from
      before deciding.
- [ ] Refine the documentation in `docs/` — first pass written 2026-08-06. Still
      open: (1) read it as a newcomer — the turn-loop and "model proposes, code
      disposes" sections assume too much; (2) add diagrams for the turn loop and the
      turns→answers assembly; (3) the RUNBOOK's storage section references a
      walk-the-bucket script that only exists in chat history — commit it under
      `scripts/` and link it; (4) re-check "Known limitations" against reality.
      Sub-item on loose root markdown is now partly resolved — `financial-analysis.md`
      and `operating-cost-analysis.md` were gitignored 2026-08-20.
- [ ] **Two doc suggestions awaiting a human** (agents may not apply these):
      (a) `raw/README.md` lines 3 and 9 still link `../ai/`, dead since the
      `wiki/` rename in `760bac2` — `sed -i '' 's|\.\./ai/|../wiki/|g' raw/README.md`;
      (b) `README.md:102` says "Currently vendored: `documentation`" when there are
      now five skills. Both were deliberately left unapplied under the AGENTS.md
      ownership rule.
- [ ] Scoring-model evaluation project (local-first) — designed 2026-08-20, handed
      off as a standalone brief for a separate session. Compare Meta's Muse Glimmer
      running locally against Sonnet 5 on 50 real scored answers (32 still have
      frames). Goal is **privacy, not cost** — self-hosting is more expensive at
      this volume. Note `purgeSessionFrames` is actively deleting the corpus, so
      snapshotting is step one. Phase 2 is local Whisper, without which the privacy
      claim is untrue.
- [ ] `--chart-1..5` tokens are dead — nothing reads them; both chart components
      use literal hexes. Either wire the charts to the tokens or drop them.
- [ ] Run tier-3 placement-matrix pairings (36) — `pairingsByPriority(3)`.
- [ ] Pressure test the interview rounds, or build a workflow to test questions per
      round (the webcam portion can't be exercised by AI — necessarily partly manual).
- [ ] Live interview: option to change target role via profile settings — depends on
      the profile section below existing first.
- [ ] Create a profile section: personal details, resume update, and a way to
      download reports for past interviews.
- [ ] Create a list of basic tests to run each time a new feature ships — a
      process/checklist item, not tied to any specific bug.
- [ ] Research current advancements in AI agents re: interviews — papers and other
      startups — and use it to surface more research directions.

## Done

- [x] App design/UI overhaul and button decisions — (2026-08-20) `5f5bdd0`.
      Every colour token was `oklch(x 0 0)` — literally zero chroma — so the app
      read as stock shadcn regardless of layout. Replaced with a warm ground plus
      forest green and four named category accents, each an exact arithmetic
      conversion of its hex rather than eyeballed. Added `pill`/`pill-sm` button
      sizes and an Instrument Serif display face. Two pre-existing bugs surfaced
      doing it: `--font-sans: var(--font-sans)` was self-referential, so **the
      whole app had been rendering in Times New Roman**; and
      `SubjectBreakdownChart` filled its bars with `var(--color-secondary)`, a
      near-white surface tint, so those bars were nearly invisible. The charts
      turned out not to read `--chart-*` at all — both files now use the palette.
- [x] Mobile UI — layout half — (2026-08-20) `64d935f`, `ae39b51`. Verified at
      375px and on the user's own handset. The header rendered as
      "InterviewPrepDashboard" with "New interview" broken across two lines;
      wrapping fixed the clipping but produced a three-line flush-left header on a
      real phone, so the nav now collapses behind a 44px control pinned top right
      with a right-aligned panel. Tap targets raised from ~20/28/36px to a measured
      44px across nav links, sign-out and the role chips. Note `py-2` was **not**
      enough — 16px on a 20px line box lands at 36px, caught only by measuring the
      DOM rather than reading the class names. The webcam/capture half stays open
      above.
- [x] Wrong-role interview agendas — (2026-08-20) `78b0ab3`. A McKinsey consulting
      interview asked about recursion, SQL window functions, Moore vs Mealy machines
      and JavaScript's event loop. `tagMatches` compared whole strings, so
      "Consulting" could not reach the tag `associate_consultant`; that returned
      zero eligible rows and one line — `pool = eligible.length > 0 ? eligible : bank`
      — silently substituted all 728 questions, round-robining across 38 subjects.
      The student was served electronics questions while the right consulting
      questions sat unused. Replaced with token-subset matching plus light stemming
      (the same shape as `companyMatches`): validated against all 16 real tags,
      18 roles unchanged, zero regressions. The silent fallback is gone —
      `/interview/new` now says the role isn't covered and offers the JD path plus
      the 16 real roles as one-click alternatives. 2 of 10 bank-sourced sessions had
      been affected.
- [x] Login feedback and error copy — (2026-08-20) `0567099`. A slow login looked
      identical to a dead button on a phone; both auth forms now hold
      "Signing you in…" disabled for the whole request. The failure message points
      at sign-up but deliberately does **not** say whether the account exists —
      verified against this project's Supabase that a nonexistent address and a real
      address with a wrong password return byte-identical
      `invalid_credentials`, so distinguishing them would require adding an
      account-enumeration oracle.
- [x] Doc ownership boundary bound in AGENTS.md — (2026-08-20) `817d694`. The rule
      previously lived only in `workflows/doc-update.md`, so it applied when that
      workflow ran and nowhere else.
- [x] Four more agent skills vendored + working notes gitignored — (2026-08-20)
      `c4e8b06`. `supabase-postgres-best-practices`, `frontend-design`,
      `web-design-guidelines`, `find-skills`. Two carry Snyk "Med" ratings for real
      reasons worth remembering: `web-design-guidelines` fetches its actual rules
      from a live URL at run time (so its behaviour is not pinned by
      `skills-lock.json`), and `find-skills` instructs installing with `-y`.

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
