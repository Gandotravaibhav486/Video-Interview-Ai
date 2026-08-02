# Question-bank generation — chat workflow

Operational steps for building interview questions per role+company by hand in
a chat UI. Mirrors the automated pipeline in
`src/lib/ai/question-bank-generation.ts`.

Three passes per pairing. Substitute `{ROLE}` and `{COMPANY}` throughout —
lowercase snake_case (`business_analyst`, `larsen_toubro`). Use `{COUNT}` = 10.

> **Pass 3 must be a NEW chat.** In the API version the verifier is a separate
> call with no memory of writing the questions. Paste it into the same
> conversation and the model defends its own work — this is not hypothetical,
> it is the bug that let role-drifted questions through on the first build.

## Setup per pass

| Pass | Model | Web search | Extended thinking | New chat? |
|---|---|---|---|---|
| 1 — Research | **Opus** | **ON** (required) | On | New chat per pairing |
| 2 — Generate | **Sonnet** | Off | Off | Continue pass 1's chat |
| 3 — Verify | **Opus** | Off | On | **Must be a new chat** |

Why this split, matching the API pipeline:

- **Research uses Opus with web search** because judging which claims are
  actually evidenced — versus generic interview advice dressed up as
  company-specific — is the hardest reasoning in the pipeline, and everything
  downstream inherits its mistakes.
- **Generation uses Sonnet.** Writing questions against already-gathered
  research is the easy part. In the API runs this pass was ~$0.06 per pairing
  versus ~$0.50–1.70 for research; Sonnet was never the quality bottleneck.
  If your chat plan only exposes one model, Opus works fine here too.
- **Verification uses Opus, no tools.** It judges strictly against the pass-1
  research text you paste in — it must *not* search for fresh evidence, or it
  starts grounding questions in material the generator never saw, which defeats
  the audit.

Pass 2 can stay in pass 1's conversation (the research is already in context,
so you can skip re-pasting it). Pass 3 cannot — see the warning above.

---

## Pass 1 — Research

**Model: Opus · Web search: ON · Extended thinking: on · Start a new chat**

Web search is mandatory here — without it the model answers from memory and the
"be explicit about what you couldn't find" instruction becomes meaningless,
since it has nothing to have failed to find.

API equivalent: `claude-opus-5`, `max_tokens: 4000`, adaptive thinking, medium
effort, `web_search` tool.

```
Research how {ROLE} roles at {COMPANY} are actually interviewed, for an Indian campus-placement interview practice product.

Search for publicly documented information and report:
1. Round structure - what rounds candidates go through, in order.
2. Subject emphasis - which topics dominate, and which barely appear.
3. Question style - the actual shape of questions (e.g. leadership-principle STAR behaviourals, timed aptitude puzzles, whiteboard DSA, case/stakeholder scenarios).
4. Difficulty calibration for a fresher/early-career candidate.
5. Sources - which pages you drew this from.

Be concrete and specific to {COMPANY}. If you cannot find company-specific evidence, say so explicitly rather than describing generic interview practice as though it were documented for this company - a later verification step depends on knowing which claims are actually evidenced.
```

**Keep the entire reply.** It feeds passes 2 and 3, and gets stored as
`question_bank.grounding_notes`.

---

## Pass 2 — Generate

**Model: Sonnet · Web search: OFF · Same chat as pass 1**

Turn web search off. This pass must write only from the research you gathered —
if it searches for more, the verifier in pass 3 will be judging against research
notes that no longer describe what the questions were actually built from.

Staying in pass 1's chat means the research is already in context; you can drop
the `{PASTE PASS 1 OUTPUT}` block and just say "using the research above".

API equivalent: `claude-sonnet-5`, `max_tokens: 16000`, forced tool use for
structured JSON.

```
Below is research on how {ROLE} roles at {COMPANY} are interviewed.

---
{PASTE PASS 1 OUTPUT}
---

Write {COUNT} interview questions for a {ROLE} at {COMPANY}, for Indian campus placement practice.

- Every question must test the competencies of a {ROLE}. This is non-negotiable and outranks company fidelity: if the research says {COMPANY} does not hire {ROLE}s from campus, or only documents a *different* role's process, write questions appropriate to a {ROLE} anyway and let them be judged as generic-for-the-role. Do NOT substitute the other role's questions. A DSA or OOP question tagged as a {ROLE} question is a failure, no matter how well evidenced it is for some other role at the same company.
- Within that constraint, match the documented round structure and question style above. If the research says this company runs leadership-principle behaviourals, write leadership-principle behaviourals - not generic "tell me about a project".
- Spread questions across the subjects the research says actually get tested for THIS role, weighted toward the ones it says dominate.
- Each reference answer must be a detailed, self-contained model answer covering what a strong candidate would hit. It is the sole grounding context when scoring a real spoken answer later, so a vague one silently degrades scoring.
- Calibrate difficulty to a fresher/early-career candidate.
- Questions must be answerable out loud in a spoken interview. No "you are shown a grid", no "here is a code snippet" - the candidate only hears the question.
- Do NOT invent company-specific detail the research did not support. A question that is reasonable for the role generally is fine; a question that falsely implies "this is what {COMPANY} asks" is not. A separate verification step will check this.

Return a JSON array. Each item:
{
  "subject": "lowercase_snake_case",
  "skills": ["1-4 lowercase_snake_case skills"],
  "question_text": "...",
  "reference_answer": "...",
  "question_type": "behavioral | technical | hr | resume_followup",
  "difficulty": "easy | medium | hard"
}

subject - prefer dsa, oops, dbms, hr, communication, system_design, operating_systems, computer_networks, aptitude where they genuinely fit; otherwise coin a new snake_case tag (e.g. business_analysis, product_sense) rather than force-fitting.

skills - finer-grained than subject, named as they'd appear on a resume (sql, joins, stakeholder_management, requirement_gathering). These get matched against skills extracted from candidate resumes.
```

---

## Pass 3 — Verify

**Model: Opus · Web search: OFF · Extended thinking: on · MUST be a new chat**

Both settings here are load-bearing:

- **New chat** — a verifier that remembers writing the questions defends them.
  This is the failure that shipped role-drifted questions on the first build.
- **Web search off** — it must judge against the pass-1 research you paste in,
  nothing else. Let it search and it will ground questions in evidence the
  generator never had, which is no longer an audit of what was produced.

API equivalent: `claude-opus-5`, `max_tokens: 8000`, adaptive thinking, medium
effort, forced tool use, no web search.

```
You are auditing interview questions written for a {ROLE} at {COMPANY}, for an Indian campus-placement practice product.

Research findings:
---
{PASTE PASS 1 OUTPUT}
---

Candidate questions:
---
{PASTE PASS 2 OUTPUT}
---

Apply these two tests to each question, in order.

TEST 1 - role fidelity (a failure here is always "rejected", however well evidenced the question is):
Does this question test what a {ROLE} is actually hired for? A question that is thoroughly documented for a DIFFERENT role at {COMPANY} still fails: questions get stored tagged as {ROLE} questions and served to candidates practising for {ROLE} interviews. Watch specifically for the case where the research found no {ROLE} process at this company and the writer quietly substituted another role's questions (e.g. software-engineering DSA/OOP/SQL content under a non-engineering role). Reject those.
Also reject anything that cannot be answered out loud - questions referencing a grid, diagram, code snippet, or anything shown on screen.

TEST 2 - grounding (only for questions that passed test 1):
- "grounded": clearly matches the documented interview patterns above for this specific role AND company.
- "plausible": reasonable for a {ROLE} in general, but the research does not specifically evidence that {COMPANY} asks this of {ROLE} candidates.

Be discriminating. If the research admits it found little evidence for THIS role at THIS company, then almost nothing deserves "grounded" - most should be "plausible", and anything borrowed from another role should be "rejected". Do not inflate verdicts to be agreeable; an audit that approves everything is useless, and the questions you approve go straight into a live product.

Return one verdict per question as JSON: [{"index": 0, "verdict": "grounded|plausible|rejected", "reason": "one sentence"}]
```

---

## Pass 4 — Hand back

Paste the pass-2 JSON plus the pass-3 verdicts. Rejected items are dropped; the
rest are inserted with `source: 'ai_generated'`, their verdict, and the pass-1
research stored as `grounding_notes`.

Track per pairing, for the cost comparison:

| Field | Note |
|---|---|
| Pairing | `{ROLE} @ {COMPANY}` |
| Questions generated | usually 10–12 |
| Questions kept | after rejections |
| Verdicts | grounded / plausible / rejected |
| Wall-clock minutes | including copy-paste |

---

## Progress

**Bank: 498** — 23 hand-written + 475 generated across 46 pairings.

**Done (46):**
- `business_analyst` @ deloitte, tcs · `embedded_engineer` @ qualcomm ·
  `mechanical_engineer` @ larsen_toubro (4, ad-hoc API run)
- `product_manager` @ adobe, cred, flipkart, google, groww, meesho, microsoft,
  ola, paytm, phonepe, razorpay, swiggy, uber, zomato (14, ad-hoc API run)
- **All 28 tier-1 pairings** (this file's table below, now empty) — run by hand
  in chat, Pass 4 applied 2026-08-02: 280 questions, 204 grounded / 76
  plausible / 0 rejected

**Pending: 79** of the 130 pairings in `src/lib/questions/placement-matrix.ts`
(tier 2 + tier 3 only — tier 1 is fully done).

> Only 33 of the 46 completed pairings are matrix entries (the 28 tier-1 ones
> plus embedded_engineer@qualcomm, mechanical_engineer@larsen_toubro,
> business_analyst@deloitte/tcs, and product_manager@adobe). The other 13
> product-manager ones were run ad-hoc and were never added to the matrix.
> Also outstanding: `product_manager @ dream11`, killed by the API cap before
> it spent anything.

### Tier 1 — DONE (28/28)

All 28 tier-1 pairings are generated. Table removed — see Tier 2 below for
what's next.

### Tier 2 — 61 pending

Selected: `qa_engineer@tcs` · `data_analyst@infosys` · `data_engineer@amazon` ·
`data_scientist@microsoft` · `data_analyst@google` · `vlsi_engineer@intel` ·
`vlsi_engineer@nvidia` · `vlsi_engineer@texas_instruments` ·
`business_analyst@flipkart` · `sde@zomato` · `sde@swiggy` ·
`consultant@deloitte` · `data_analyst@zs_associates` · `data_analyst@mu_sigma` ·
`data_scientist@fractal_analytics` · `associate_consultant@bain` ·
`business_analyst@mckinsey` · `associate@bcg` · `quant_analyst@goldman_sachs` ·
`quant_analyst@ubs` · `civil_engineer@larsen_toubro` ·
`electrical_engineer@siemens` · `mechanical_engineer@bosch` ·
`mechanical_engineer@maruti_suzuki` · `mechanical_engineer@tata_motors`

Full list: `pairingsByPriority(2)` in `src/lib/questions/placement-matrix.ts`.

### Tier 3 — 36 pending

`pairingsByPriority(3)` in the same file.

---

## Suggested order

Tier 1 first — highest campus volume, and where the bank is currently emptiest
for non-SDE roles. Within tier 1, the IT-services mass recruiters (TCS,
Infosys, Wipro, Accenture, Cognizant) cover the most students per pairing.
