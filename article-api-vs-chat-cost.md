# I burned 87% of my monthly API budget in a day. Then I rebuilt the same workflow in chat.

*Draft — chat-side numbers marked `[TBD]` to be filled in after the manual runs.*

---

## The thing I was building

I'm building an AI mock-interview app for Indian campus placements. Students
record video answers, get them transcribed and scored against a reference
answer, and track improvement over time.

The whole product rests on one asset: a bank of realistic interview questions,
each paired with a detailed model answer. The model answer isn't decoration —
it's the sole grounding context when the AI scores a real spoken response. A
vague reference answer silently degrades every score derived from it.

I had 23 questions, hand-written, almost all tagged for software engineering
roles. A student targeting business analyst roles got an interview made of two
HR questions, one communication question, and three aptitude puzzles. No domain
content at all, because none existed.

I needed hundreds of questions across dozens of role+company combinations. So I
built a pipeline.

## The pipeline

Three passes per role+company pairing:

1. **Research** — a model with web search finds what's publicly documented
   about how that company interviews for that role: round structure, subject
   emphasis, question style, difficulty calibration, sources.
2. **Generate** — a second call writes questions grounded in those findings,
   with full reference answers.
3. **Verify** — a *third* call, with no memory of writing the questions, audits
   each one and returns `grounded`, `plausible`, or `rejected`.

The third pass is the one that matters, and I only learned why by getting it
wrong. In the first version the verifier shared context with the generator, and
it approved a batch of software-engineering DSA and SQL questions written for a
**product manager** pairing. The research had correctly found that this company
runs no campus PM pipeline — and the generator had quietly substituted the
company's *software engineer* questions instead. They were genuinely
well-evidenced. Just for the wrong role.

Splitting the passes and making role fidelity an automatic rejection fixed it.
Re-run on the same pairing: five "grounded" verdicts became zero, with two
outright rejections citing "borrowed from a different pipeline."

## What it cost

I ran it twice. Models: Opus for research and verification, Sonnet for
generation.

| Run | Pairings | Questions kept | Input tokens | Output tokens | Cost |
|---|---|---|---|---|---|
| Engineering + business analyst | 3 | 30 | 351,232 | 37,126 | $2.42 |
| Product manager × 15 companies | 14 | 154 | 2,432,533 | 176,963 | $15.07 |
| **Total** | **17** | **184** | **2,783,765** | **214,089** | **$17.49** |

- **$1.03 per role+company pairing**
- **$0.095 per question retained**
- **~2.9 minutes per pairing**, unattended

The second run is the one that hurt. Fifteen companies, one sitting, **$15.07**.

## Three things I did not expect

**Research is 80–85% of the bill.** Generation costs about $0.06 per pairing.
Verification about $0.05. The web-search pass eats everything else, because
every fetched page lands in the context window. Any optimisation not aimed at
research is rounding error.

**Cost scales *inversely* with evidence quality.** This is the counterintuitive
one. The best-documented pairing in the whole project — embedded engineer at
Qualcomm — was also the **cheapest at $0.35**. The search converged fast because
the material was there. The most expensive was product manager at Paytm:
**$1.79 on 306,000 input tokens**, because the search loop kept issuing
continuations hunting for material that didn't exist.

You pay the most for the answers you can trust the least.

**Per-pairing cost is not portable across roles.** I estimated the
product-manager batch at ~$9 based on the engineering runs. It came in at
$15.07 — **67% over**. PM research consistently pulled two to three times the
search content, because PM interview material is scattered across blog posts
and community write-ups rather than concentrated in a few structured sources.

## The wall

Mid-run, on the fifteenth and final company:

```
You have reached your specified API usage limits.
You will regain access on 2026-09-01 at 00:00 UTC.
```

A **$20 monthly cap**, and I'd spent **$17.49 of it in a single day** — 87%,
almost all of it in one 25-minute batch.

The immediate problem wasn't the lost pairing. It was that a single content-
generation task had taken down **every AI feature in the product** for the rest
of the month: answer scoring, the live conversational interviewer, resume
parsing, job-description analysis. Anyone using the deployed app would record
an interview, upload it, and watch scoring fail.

Two lessons, neither subtle in hindsight:

**A batch job and a production service should not share a spending limit.** I
was treating $20 as generous headroom for a hobby project. It was, right up
until one job with unbounded search behaviour consumed it. There was no
per-task budget, no circuit breaker, no warning at 50%.

**Cost estimates from a pilot don't survive a change of domain.** My $0.60
per-pairing figure was measured honestly. It was also measured entirely on
engineering roles, and it did not transfer.

## The pivot

The cap is a self-imposed API limit. But I also pay for a chat subscription —
flat monthly, no per-token metering.

The pipeline is three prompts. Nothing about it *requires* the API. The API
version adds orchestration, structured tool-use output, automatic database
insertion, and unattended execution. What it does not add is any capability the
model lacks in a chat window.

So I've rebuilt it as three copy-paste prompts, run by hand. Same research
prompt, same generation prompt, same verification prompt. The one rule I have
to enforce manually is the one that mattered most: **pass 3 goes in a brand new
conversation**, because a verifier that remembers writing the questions will
defend them.

## The comparison

*Chat figures pending — I'll fill these in once I've run a batch by hand.*

| | API | Chat |
|---|---|---|
| Questions produced | 184 | `[TBD]` |
| Pairings completed | 17 | `[TBD]` |
| Direct cost | $17.49 | `[TBD]` |
| **Per question** | **$0.095** | `[TBD]` |
| **Per role+company** | **$1.03** | `[TBD]` |
| Wall-clock per pairing | 2.9 min unattended | `[TBD]` (hands-on) |
| Human attention per pairing | ~0 | `[TBD]` |

The honest framing isn't "chat is cheaper." It's that the two prices are
denominated in different currencies. API cost is money and scales linearly with
volume. Chat cost is **your time**, and it's already sunk into a subscription
you're paying regardless.

At my remaining workload — 125 pairings — the API path projects to roughly
**$129**. The chat path projects to `[TBD]` hours of copy-paste at zero marginal
cost.

There's a crossover point. At 10 pairings, doing it by hand is obviously right.
At 1,000, the human time dominates and the API obviously wins. Somewhere in
between is a line that depends on what your time is worth and whether the work
is a one-off or a recurring pipeline. Mine is a one-off: I build this bank once.

## What I'd tell past me

**Meter the pilot before scaling it.** I ran four pairings first, which was
correct. I just drew the wrong conclusion, because all four were the same *kind*
of role.

**Separate budgets by blast radius.** Batch content generation and live
production traffic should never be able to starve each other.

**Instrument cost from the first call, not after the surprise.** I added token
accounting to all three passes *after* the expensive run — so the $15.07 batch
is well documented and the $2.42 batch is reconstructed. Usage data is free at
call time and impossible to recover afterwards.

**"Unattended" is a feature you pay for, and sometimes you don't need it.** The
API version's real advantage over chat is that it runs without me. For a
one-time bank build, that convenience cost $17.49 and a month of production
downtime.

---

*Next: the manual runs. I'll update the table with real chat-side numbers, and
whether the questions come out measurably different when a human is in the loop
on every pass.*
