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
