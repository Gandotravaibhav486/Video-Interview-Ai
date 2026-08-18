# InterviewPrep

AI-conducted mock interviews for Indian campus placements. A student picks how
to start, then sits a **live, conversational interview** — the AI asks a
question, listens, decides whether to probe deeper or move on, and closes out.
Afterwards it scores every answer against a rubric and tracks progress over
time.

Live at **[mockintervew.com](https://mockintervew.com)**.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

Open <http://localhost:3000>. You'll need a Supabase project with the
migrations in `supabase/migrations/` already applied — see
[docs/RUNBOOK.md](docs/RUNBOOK.md#applying-a-migration), since there's no CLI
link and migrations are applied by hand.

### Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-side Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes + background scoring. **Never expose to the browser.** |
| `ANTHROPIC_API_KEY` | Claude — the interviewer, scoring, and all content generation |
| `GROQ_API_KEY` | Speech-to-text (`whisper-large-v3-turbo`) |
| `RECORDING_RETENTION_DAYS` | Intended media retention window. **Declared but not yet enforced** — see [RUNBOOK](docs/RUNBOOK.md#storage). |
| `NEXT_PUBLIC_APP_URL` | Absolute URLs in emails/redirects |
| `RESEND_API_KEY`, `NOTIFY_EMAIL` | Optional visit notifications |

## How an interview works

Three ways to start, all producing the same live interview:

| Source | What it does |
|---|---|
| **Choose a role** | Picks a role + company and get subject questions around that from a well curated mixed subject question bank (728 questions, 48 companies, 16 roles) |
| **Paste a job description** | Analyses the posting and generates questions specific to it, then starts immediately |
| **Use my resume** | Generates questions grounded in your actual projects, skills and metrics |

Whichever you pick, the session runs through the same turn loop and the same
post-session scoring pass. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how that loop works and why
it's shaped the way it is.

## Stack

- **Next.js 16** (App Router, Turbopack) · React 19 · TypeScript · Tailwind · shadcn/ui
- **Supabase** — Postgres with row-level security, Auth, Storage
- **Claude** — `claude-opus-5` for the live interviewer and question verification, `claude-sonnet-5` for scoring, resume and JD analysis
- **Groq** — `whisper-large-v3-turbo` for speech-to-text, called synchronously inside a route handler
- **Vercel** — auto-deploys from `main`

No WebRTC, no SFU, no video-infra vendor. Capture is browser-native
(`getUserMedia` + `MediaRecorder` + a canvas frame loop) and uploads straight
to Supabase Storage — see
[ARCHITECTURE § Media capture](docs/ARCHITECTURE.md#media-capture).

## Layout

```
src/
  app/(app)/          dashboard, interview flow, admin question bank
  app/(auth)/         login, signup
  app/(onboarding)/   two-step onboarding, gated separately from (app)
  lib/ai/             interviewer, scoring, JD/resume/question-bank generation
  lib/interview/      turn state machine, per-question media assembly
  lib/questions/      curated-bank selection, placement matrix
  lib/actions/        server actions (session creation, turns, uploads)
  hooks/              useInterviewRecorder, useSilenceDetection
supabase/migrations/  schema, applied manually
workflows/            manual chat workflows + the project to-do list
docs/                 architecture and operations
```

## Docs

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the live interview loop, scoring, and question sourcing actually work, and the constraints that shaped them
- **[docs/RUNBOOK.md](docs/RUNBOOK.md)** — migrations, recovering stuck sessions, storage cleanup, deploy gotchas
- **[workflows/](workflows/)** — manual chat workflows and the running to-do list
- **[AGENTS.md](AGENTS.md)** — instructions for AI coding agents working in this repo

`docs/` and this README are **human-owned**: agents propose changes to them
with evidence but never edit them directly. The knowledge base they reason
from lives in [`raw/`](raw/) (append-only sources) and [`wiki/`](wiki/)
(agent-owned synthesis), refreshed by the
[doc-update workflow](workflows/doc-update.md).

### Vendored agent skills

`.agents/skills/` holds skills committed to the repo so every contributor and
agent gets the same behaviour, pinned by content hash in `skills-lock.json`.
`.claude/skills/` symlinks into it for Claude Code; the same directory is read
by Codex, Cursor, Copilot and others.

Currently vendored: **`documentation`** — used to write the docs above, and
the thing to reach for when adding or reworking them.

```bash
npx skills add <repo-url> --skill <name>   # add another
```

## Contributing

Work commits directly to `main`; Vercel deploys on push. Before pushing:

```bash
npx tsc --noEmit && npx eslint src
```

A green build locally does **not** guarantee a green Vercel build — see
[RUNBOOK § Deploys](docs/RUNBOOK.md#deploys) for the two ways that has bitten.

## Appendix

This appendix contains non-essential notes and background information that is
not required to run the application locally.
