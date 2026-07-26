# video-ai-brain

A running log of every feature, idea, bug, and decision discussed for **InterviewPrep** (mockintervew.com) — an AI-powered mock interview practice app for students preparing for campus placements (TCS/Infosys/Wipro/Accenture-style rounds plus general tech interviews).

**Status legend:** `Implemented` (live in production) · `Fixed` (a bug that was caught and resolved) · `Ideation` (designed/discussed, not built) · `Not started` (identified as a gap, no design work done yet)

---

## Vision

Companies like Mercor have already started running AI-based interviews for real hiring decisions. The bet behind this whole project: interviewing is heading toward being largely AI-driven — even HR rounds — so students should be able to practice against the real thing before it's their actual interview, and get evaluated the way a real panel would (content, delivery, demeanour, attire, eye contact), not just get generic question lists.

---

## Core features

### `Implemented` — Full AI-conducted mock interview sessions
Multi-question sessions (not one question at a time). Student records video answers via webcam, gets scored out of 100 across weighted parameters (content, delivery, attire/professionalism, posture/body language), plus per-question feedback. Scoring is grounded against a reference answer (curated or AI-generated) rather than scored from scratch, so results stay consistent across students answering the same question.

### `Implemented` — Curated question bank + auto-selected sessions
Admin-managed bank tagged by subject/role/company. Sessions auto-select a balanced mix (round-robin across subjects) rather than generating fresh each time. Currently 23 active questions across 9 subjects (see "Question bank expansion" below).

### `Implemented` — Resume-first onboarding + AI-suggested interviews
Resume upload is the first thing a student sees post-signup (skippable). Once parsed, `analyzeResume()` extracts skills + 2-4 distinct suggested-interview cards (role/company/subjects/rationale) shown on `/interview/new`, so there's a direct line from "upload your resume" to "here's something personalized to try."

### `Implemented` — Custom job-description-based question generation
Paste any JD at `/jd` → structured extraction (role, seniority, required skills, subjects) → a private question set generated with reference answers up front (so scoring always has grounding), scoped to that JD only (doesn't pollute the shared curated bank).

### `Implemented` — Domain Interview (resume-grounded questions)
One-click button on the dashboard: generates interview questions from the student's *own* resume — specific projects, skills, and quantified achievements — not generic "tell me about a project" questions. Straight into recording, no review step. Cached until the resume is re-uploaded (then invalidated and regenerated). Verified live: generated questions correctly named real specifics (e.g. "$300M downstream exposure," a Kaggle Silver Medal NLP pipeline, a ₹70k+ Ketto fundraiser).

### `Implemented` — Let JD/resume subject extraction invent new subjects
The AI used to force-fit any JD/resume outside a fixed 6-subject vocabulary (dsa/oops/dbms/hr/communication/system_design) into the nearest wrong bucket — a DevOps posting would get filed under "system_design." Fixed by explicitly telling the AI it can invent a new lowercase snake_case tag when nothing fits, while still preferring known subjects when they do. Verified: a DevOps/SRE JD correctly produced `cloud_infrastructure`/`devops`; a plain Java JD correctly stayed on known vocabulary (no needless fragmentation); an ML-heavy resume correctly picked up `machine_learning`/`data_engineering`.

### `Implemented` — Question bank expansion: Operating Systems, Computer Networks, Aptitude
Added the three subjects most conspicuously missing for this app's target audience (Indian campus placement screening rounds live and die on OS/CN theory + quantitative aptitude). Seeded 5 real questions each with verified reference answers.

### `Implemented` — Visit notification emails
Fire-and-forget email (via Resend, `event.waitUntil()` so it never blocks page loads) whenever someone does a real top-level page visit on mockintervew.com — filtered to exclude API polling, prefetches, and client-side soft-navigations (`sec-fetch-mode: navigate` check), throttled to 1 email per visitor per 6h via cookie, production-only. Verified working end-to-end after fixing a Resend sandbox-domain restriction (sandbox senders can only deliver to the exact email the Resend account is registered under).

---

## Bugs caught and fixed (worth remembering)

### `Fixed` — "DOMMatrix is not defined" crash in production resume parsing
`pdf-parse` (via `pdfjs-dist`) needs a Node polyfill for the browser-only `DOMMatrix` API. Worked perfectly locally (a polyfill package happened to already be installed with the right native binary) but crashed on every real resume upload/Domain Interview click in production. Fixed by explicitly passing `CanvasFactory` into the parser and marking the polyfill package external in the build config. **Lesson:** local testing of anything touching native/browser-adjacent dependencies proves nothing about production — the only reliable check is the actual deployed environment.

### `Fixed` — Domain Interview sessions mislabeled + wrong timestamps
Session titles showed the raw target role ("business_analyst") with no indication it was a resume-based practice round. Timestamps were rendered server-side via `toLocaleString()`, which uses the *server's* timezone (UTC on Vercel), not the viewer's — so a session at 2:21 PM IST displayed as 8:51 AM. Fixed by labeling `resume_based` sessions clearly and moving timestamp rendering to a client component so it picks up the browser's real timezone.

### `Fixed` — `redirect()` called from inside a `catch` block (recurring lesson)
Next.js's `redirect()` throws internally and misbehaves when called inside a `try/catch` — must flag the error into a variable and redirect only after the block fully exits. Hit and fixed in the JD feature; applied proactively from day one in the Domain Interview feature.

---

## Ideas discussed but not built

### `Ideation` — Two-stage answer scoring redesign
Instead of one Claude call producing a score directly, split into: (1) `describeAnswer()` — a purely descriptive/subjective pass over what the candidate said, and (2) `scoreFromDescriptions()` — a second pass that scores 0-100 against specific keywords/directions to look for, using the description as input. Discussed in detail as *the* MVP-critical piece of the scoring pipeline, but the user wanted to review the design further before building it. **Not yet implemented — revisit when picked back up.**

### `Ideation` — Automated test suite
Confirmed there are currently **zero automated tests** in the codebase (no test runner installed, no `*.test.ts` files) — all verification so far has been manual (type-check, build, live browser checks, direct DB inspection, one-off `tsx` scripts hitting real AI calls). Discussed adding Vitest for the pure-ish `lib/ai/*` / `lib/questions/select.ts` / `lib/sessions/persist-session.ts` logic, and/or Playwright for critical end-to-end flows (signup→onboarding, start-interview→results). **Not started — no decision made on scope/priority yet.**

### `Ideation` — Custom SMTP for Supabase auth emails
Supabase's default/shared email provider is hard-capped at **2 emails/hour project-wide** (confirmed via docs) — covers signup confirmations, magic links, password resets, all combined. This is almost certainly why confirmation emails have been flaky during testing. Custom SMTP (e.g. Resend, SendGrid) would raise this significantly. **Discussed, not set up.**

### `Ideation` — Verified sending domain for Resend
Currently using Resend's sandbox sender (`onboarding@resend.dev`), which can only deliver to the Resend account's own registered email — fine for personal visit notifications right now, but would need a verified `mockintervew.com` sending domain (a few DNS records) to send to arbitrary recipients or to look legitimate enough to avoid spam filters if this ever needs to email actual users.

### `Ideation` (pre-existing, unimplemented, noted in original MVP plan) — CV/integrity signals
Schema has inert `client_signals`/`integrity_flags` JSONB columns and extension seams (`useInterviewRecorder.getStream()`, visibility/blur listeners) for future in-browser computer vision (eye contact/posture/expression tracking) and cheating detection (tab-switch, multiple faces, gaze-away). Deliberately built as seams, not implemented — scoped as a later addition from the very first MVP plan.

### `Ideation` (pre-existing) — Video retention cleanup job
`RECORDING_RETENTION_DAYS` env var exists but nothing actually deletes old recordings yet.

---

## Content / growth

### `Done` — Feedback request messages drafted
Drafted WhatsApp-brief and longer email versions asking testers to try a full session and report back on: anything broken, whether scoring felt accurate, and what's missing before they'd recommend it. Final WhatsApp version opens with the Mercor/AI-interviews-are-the-future thesis as the hook before introducing the app.

### `Done` — Medium post draft
Drafted a build-log-style Medium post summarizing a single day's shipped work: Domain Interview launch, the DOMMatrix production bug (told as an honest war story), the subject-vocabulary force-fit fix, and the question bank expansion — including the self-caught math error in one seeded aptitude question before it shipped.

---

## Infra reference (for context, not features)

- **Stack:** Next.js 16.2.10 (App Router, Turbopack) + Supabase (Postgres/Auth/Storage) + Anthropic Claude (`claude-sonnet-5`) + Groq (`whisper-large-v3-turbo` for STT)
- **Deployment:** Vercel, auto-deploys from `main`. Custom domain `mockintervew.com` + default `*.vercel.app` URL.
- **Repo:** [github.com/Gandotravaibhav486/Video-Interview-Ai](https://github.com/Gandotravaibhav486/Video-Interview-Ai), single `main` branch, direct commits (no PR workflow).
- **Migrations:** 5 applied (`0001_init` through `0005_domain_interviews`), all manually run via Supabase SQL Editor (no CLI/psql access).
