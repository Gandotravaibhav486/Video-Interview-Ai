# Workflows

Manual, copy-paste-able chat workflows for this product — processes that don't
need code to run, but are repeatable enough to be worth writing down once
rather than reconstructing from memory each time.

Not the place for: one-off notes, status docs (`../video-ai-brain.md`),
write-ups/articles (`../article-*.md`), or anything that's actually
implemented as code (that belongs in `src/`, documented by the code itself).
A workflow here should be something a human runs by hand, step by step, in a
chat UI or terminal.

## Index

- [question-bank-generation.md](question-bank-generation.md) — three-pass
  (research → generate → verify) prompt sequence for producing role+company
  interview questions with reference answers, run manually in chat as a
  zero-marginal-cost alternative to the API-driven pipeline in
  `src/lib/ai/question-bank-generation.ts`.
- [task-scheduler.md](task-scheduler.md) — a running to-do list for this
  project. Add tasks any time; say **"clean"** in chat to have them
  triaged — status re-verified, done items logged with what actually
  happened, and the top 3 most urgent surfaced.
- [doc-update.md](doc-update.md) — keeps the published docs honest as the app
  changes. Say **"doc-update"** to run it. Reads the append-only `raw/` sources
  and the agent-owned `ai/` knowledge base, updates `ai/`, then **suggests**
  (never applies) changes to `README.md` and `docs/`. Follows Andrej
  Karpathy's LLM wiki pattern, with a review gate added on anything a human
  will act on.
