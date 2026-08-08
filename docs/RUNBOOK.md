# Runbook

Operational procedures for InterviewPrep. Every gotcha here has actually
happened.

**Access needed:** Supabase dashboard for the project, the Vercel dashboard,
and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` for direct REST calls.

Most diagnosis is done with `curl` against the REST API rather than a SQL
client, because there is no Supabase CLI link and no direct Postgres access:

```bash
set -a && source .env.local && set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/interview_sessions?select=*&limit=5" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

---

## Applying a migration

There is **no CLI link and no psql access**. Migrations are applied by hand.

1. Write the file into `supabase/migrations/` using the next free number.
2. Open the Supabase dashboard → SQL Editor, paste the contents, Run.
3. Confirm success — a failed statement can leave a partial migration, since
   there's no transaction wrapper by default.
4. Verify from the outside before assuming it worked:

```bash
# PGRST205 means the table doesn't exist yet, i.e. not applied
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<new_table>?limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

For a changed CHECK constraint, verify the constraint itself:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'interview_sessions_interview_type_check';
```

> **Known issue:** there are currently **two migrations numbered `0008`**
> (`0008_jd_based_interview_type.sql` and `0008_question_bank_skills.sql`).
> Both are applied, but the numbering no longer conveys order. Renumber
> before adding `0009`.

**Rollback:** write and apply a compensating migration. Never edit an
already-applied file — the file is not the source of truth, the database is.

---

## Recovering a stuck session

### Session stuck on `processing` forever

Scoring runs in the request lifecycle via `after()`. If the process dies
mid-loop, nothing will ever call it again.

`retryLiveScoring(sessionId)` is the recovery path. It is safe to re-run:
`scoreLiveSession()` skips any question already `feedback_status: 'complete'`,
so a retry only pays for the work still missing.

Confirm what's actually incomplete first:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/answers?select=question_id,feedback_status,transcript_status" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Live interview returns 400 on every attempt

**Symptom:** the candidate answers, gets a red `400 invalid_request_error`,
and retrying reproduces it forever.

**Cause:** an *orphaned candidate turn*. If a turn was persisted without its
agent reply, the conversation has two consecutive user-role messages, which
violates strict role alternation — so every retry fails identically.

This was fixed at the source (both turns now persist only after the model call
succeeds), but historical sessions can still carry one.

**Diagnose** — look for a trailing `candidate` turn with no `agent` after it:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/live_turns?select=turn_index,speaker,decision&session_id=eq.<ID>&order=turn_index.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Fix** — delete the orphan; the session resumes from the last agent question:

```bash
curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/live_turns?session_id=eq.<ID>&turn_index=eq.<N>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Escalation:** if the 400 persists with clean alternation, the payload itself
is malformed — check `runInterviewTurn()`'s message construction, especially
that a mid-conversation system message never lands at `messages[0]`.

---

## Storage

Buckets: `recordings` (per-turn audio), `frames` (sampled stills), `resumes`.

**Roughly 5MB per live session**, almost entirely audio, once frames are
auto-purged after scoring.

### Checking usage

The top level of a bucket lists user folders, not files — you have to walk it
recursively. There's a working script pattern in the project history; the
short version is `POST /storage/v1/object/list/{bucket}` with a `prefix`,
recursing into entries whose `metadata` is null.

Also check **egress**, not just stored bytes, in the Supabase dashboard. Every
scoring pass downloads that session's audio, so egress scales with usage while
storage scales with accumulation.

### Deleting media safely

Always **download and verify before deleting**. The ordering that matters:

1. Download every target file.
2. Verify each against Storage's reported size **and** re-read it from disk
   (md5) — proving bytes landed, not just that the request returned 200.
3. Only if *every* file verified, delete.
4. Null the DB column that pointed at it (e.g. `answers.video_storage_path`),
   or the app will keep issuing signed-URL requests that always fail.

A first attempt at this failed all 27 downloads with a 400 because the bucket
name was missing from the URL (`/storage/v1/object/{bucket}/{path}` — the
bucket is required). The verify-before-delete guard is what prevented deleting
files that had never been downloaded. Keep that ordering.

> `RECORDING_RETENTION_DAYS` is declared in the environment but **nothing
> enforces it**. There is no retention sweep yet.

---

## Deploys

Vercel auto-deploys from `main`. A green local build does **not** guarantee a
green deploy. Two failure modes have both bitten:

### `maxDuration` fails the build outright

Vercel validates `export const maxDuration` at **build time** against the
plan's ceiling (300s on Hobby). An over-limit value doesn't get clamped — it
**fails the build**, and a failed build leaves the previous deployment serving.

This silently blocked every production deploy for four days while local builds
stayed green. If the site looks stale, **check the Vercel deployments list for
failed builds before debugging anything in the app.**

### Native dependencies that only break in production

`pdf-parse` needs a `DOMMatrix` polyfill from the optional `@napi-rs/canvas`
package. Locally the darwin-arm64 binary is already in `node_modules` and gets
picked up implicitly, so `tsx` scripts and `npm run build` both pass while
production throws `ReferenceError: DOMMatrix is not defined`.

Both are required: pass `CanvasFactory` explicitly to `PDFParse`, **and** list
`pdf-parse` and `@napi-rs/canvas` in `serverExternalPackages` in
`next.config.ts`.

**For any `pdf-parse`-touching change, verify against the deployed URL — not
localhost.**

### Other

- Never delete `.next` while the dev server is running; it corrupts the
  action manifest and the next form submission fails with "unexpected response
  from the server". Stop the server first.

---

## Admin tasks

**Granting admin** (unlocks `/question-bank`): set `profiles.is_admin = true`
in the Table Editor. There is no RBAC system.

**Generating questions:** the admin page drives one role+company pairing per
submit. Runs research → generate → verify; only `grounded` and `plausible`
verdicts are inserted. Long runs can exceed the serverless limit — the manual
chat workflow in
[workflows/question-bank-generation.md](../workflows/question-bank-generation.md)
is the zero-marginal-cost alternative.

**Bulk-loading generated questions:** check for collisions with existing rows
by comparing `question_text` before inserting — a re-run of an earlier batch
looks identical to new work and will silently duplicate. Also confirm
`role_tags` holds a real role, not a placement-matrix *category*, or
`selectSessionQuestions()` can never reach the rows.

---

## Auth notes

- Email confirmation is **enabled**. Test signups need the link clicked before
  the session activates.
- The `handle_new_user()` trigger that should create a `profiles` row doesn't
  always fire. The app self-heals via
  [`ensureProfile()`](../src/lib/supabase/ensure-profile.ts), called from both
  the `(app)` and `(onboarding)` layouts. **Keep that in place.**
