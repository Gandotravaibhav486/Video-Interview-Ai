# raw/ — append-only source of truth

Everything the knowledge base in [`ai/`](../ai/) is derived from. Managed by
the [doc-update workflow](../workflows/doc-update.md).

## Rules

1. **Append-only.** Add files; never edit or delete an existing one. If
   something here is wrong, add a new file correcting it and let `ai/`
   reconcile the two. The moment you can delete from the source of truth, you
   can no longer distinguish "we never knew that" from "we knew and dropped
   it."
2. **One file per source**, named `YYYY-MM-DD-short-slug.md`.
3. **Start each file with a header** saying where it came from and when:

   ```markdown
   ---
   date: 2026-08-06
   source: session transcript | analysis | schema snapshot | external article
   about: what this covers in one line
   ---
   ```

4. **Check for secrets before committing.** Cost, revenue and infrastructure
   notes plausibly belong here but not necessarily in a public repo. Decide per
   file and gitignore rather than sanitise — a redacted file in git history
   isn't redacted.

## What belongs here

Session transcripts and decision notes, analysis write-ups, schema snapshots,
point-in-time database and storage measurements, and external material worth
retaining.

## What doesn't

Anything already true in the code (link to it instead), per-session chatter
with no shelf life, and secrets.
