# doc-update

Keeps the published docs honest as the app changes. Say **"doc-update"** in
chat to run it.

Based on [Andrej Karpathy's LLM wiki
pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
(April 2026), with one deliberate change: **this workflow never edits the
published docs, it only proposes changes.** See [Why suggest, not
edit](#why-suggest-not-edit).

## When to run it

- A new doc was written and needs to be folded into the knowledge base
- The app changed in a way the docs don't reflect yet (a shipped feature, a
  fixed bug, a schema change, a new operational gotcha)
- Before showing the docs to anyone new
- Periodically, to catch drift nobody noticed

## The three layers

Karpathy's structure, using his original `wiki/` naming.

| Layer | Owner | Rule |
|---|---|---|
| `raw/` | Human | **Append-only.** Sources of truth. Added to, never edited or deleted. |
| `wiki/` | The agent | Owned outright. Edited freely **at any time**, not just during a doc-update run. New facts are *folded into* existing pages, not appended to the bottom. |
| `docs/` + `README.md` | Human | **Suggest-only.** The agent proposes changes with evidence and never applies them. |

The boundary is enforced in [AGENTS.md](../AGENTS.md), which every agent
session loads, so it binds ordinary work too — not just this workflow.

**`README.md` stays at the repo root** rather than moving into `docs/`, because
GitHub renders it as the repo homepage from that path only. It is protected
exactly like the files in `docs/`.

### `raw/` — append-only source of truth

Whatever the agent has "read" lands here as markdown and is never modified.
For this project that means things like:

- pasted session transcripts and decision notes
- analysis write-ups (cost, financial, research)
- schema snapshots and live database stats at a point in time
- storage measurements
- external material (articles, docs for a dependency)

Karpathy's rule is that raw sources are immutable — "the LLM reads from them
but never modifies them." **This workflow keeps deletion out of `raw/` even
though it allows adding**, because the moment you can delete from the source
of truth, you can no longer tell the difference between "we never knew that"
and "we knew and dropped it." If something in `raw/` is wrong, add a new file
correcting it and let `wiki/` reconcile the two.

Files are named `YYYY-MM-DD-short-slug.md` so ordering is obvious.

**Before committing anything to `raw/`, check it for secrets and private
material.** Cost and revenue analyses in particular may belong here but not in
a public repo — decide per file, and gitignore rather than sanitise.

### `wiki/` — the agent's synthesis

Markdown pages the agent owns entirely: one per subsystem or concept, with
cross-references between them. It creates pages, rewrites them when new
sources arrive, and keeps the links intact.

**Keep this current as you work, not only when doc-update runs.** If you fix a
bug, change a schema, or learn something non-obvious about how a subsystem
behaves, fold it into the relevant `wiki/` page there and then. A doc-update
run is only as good as what's accumulated since the last one — if `wiki/` is
only ever written during the run, the run is reconstructing from memory, which
is the exact failure this structure exists to prevent.

Two special files, per Karpathy:

- **`wiki/index.md`** — catalog of every page with a one-line summary, grouped
  by category. Updated on every run.
- **`wiki/log.md`** — append-only history. One entry per run, prefixed so it
  stays greppable:

  ```
  ## [2026-08-06] ingest | live-interview frame cleanup
  ```

  Record what was read, which pages changed, and any contradictions found.

## Running it

1. **Read the whole of `raw/` and `wiki/`.** Not a sample — the point is to
   notice what's missing, and you cannot notice an absence from an excerpt.
2. **Establish what actually changed.** Don't trust any of the three layers on
   its own. Check reality: `git log` since the last `wiki/log.md` entry, the
   current schema, the live database, the code itself. This project has a
   standing rule that verification beats assumption, and it applies hardest
   here — documentation drift is exactly the failure mode where a plausible
   stale sentence survives because nobody checked.
3. **Update `wiki/` to match reality.** Fold new facts into the existing page
   rather than appending; rewrite the sentence that's now wrong. Where a new
   source contradicts an existing page, **flag the contradiction explicitly**
   rather than silently overwriting — note both claims, which is newer, and
   which the code actually supports.
4. **Update `wiki/index.md`**, then **append one entry to `wiki/log.md`.**
5. **Produce a suggestion list for the published docs.** Never edit them. For
   each proposed change give:
   - the file and section
   - what's wrong now (quote it)
   - the proposed replacement
   - the evidence — a commit, a file:line, or a query result
   - a severity: **wrong** (states something false), **stale** (was true, no
     longer), **missing** (never documented), or **unclear**
6. **Report what you did NOT change**, and why. A doc-update run that only
   lists wins is not trustworthy.

## Why suggest, not edit

Karpathy's design has the LLM own the wiki layer outright, which is right for
a personal knowledge base — the cost of a bad edit is low and the owner is the
only reader.

Published docs are different. `README.md`, `docs/ARCHITECTURE.md` and
`docs/RUNBOOK.md` are what a new contributor trusts, and the runbook in
particular tells someone what to do during an incident. A confidently-worded
wrong instruction there is worse than no instruction. So the agent gets a free
hand in `wiki/`, where mistakes are cheap and recoverable, and a review gate on
anything a human will act on.

The practical consequence: **`wiki/` is allowed to be wrong and get corrected
next run. `docs/` is not.**

## What to keep out

- Anything already true in the code — link to `file:line` instead of restating
  it, or it will go stale the next time someone edits that function
  ([the "link, don't duplicate" principle](../.agents/skills/documentation/SKILL.md))
- Speculation about what the code does. Read it.
- Per-session chatter. `raw/` is for material with a shelf life.
- Secrets, keys, and anything from `.env.local`.

## Related

- [`.agents/skills/documentation`](../.agents/skills/documentation/SKILL.md) —
  the skill to use when actually writing a doc
- [task-scheduler.md](task-scheduler.md) — say "clean" to triage the to-do
  list; doc-update should add a task there when it finds a gap too big to fix
  in one pass
