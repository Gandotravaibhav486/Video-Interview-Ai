# Architecture

How a live interview actually runs, and why it's built this way. Written for
someone about to change this code.

## Context

The product is a mock-interview trainer. The hard requirement is that the AI
must behave like an interviewer — ask, listen, decide whether to probe or move
on — rather than reading a fixed list of questions at the candidate.

Two constraints shape almost every decision below.

**Claude has no native audio or video input, and no bidirectional realtime
socket.** The Messages API accepts text, images and PDFs. So "real-time" here
is a pipeline built *around* the model, not a streaming session with it.

**Vercel serverless cannot accept a WebSocket upgrade.** The design therefore
uses short request/response turns. That fits turn-taking interviews naturally
and needs no new infrastructure — no SFU, no video vendor, no persistent
connection.

## The turn loop

Client-orchestrated. One round trip per utterance.

```
agent question rendered as text
        ↓
candidate speaks
        ↓
end-of-speech detected (RMS below threshold ~2.5s) or "Done answering" clicked
        ↓
one standalone WebM audio blob  ──upload──▶  Supabase Storage
        ↓
submitTurn() server action:
    transcribeAudio()      Groq whisper-large-v3-turbo
    runInterviewTurn()     Claude, forced tool call
    applyDecision()        state machine clamps the model's proposal
    persist both turns
        ↓
next agent line rendered, loop
```

Budget is roughly 6s per turn: ~2.5s endpointing, ~0.3s upload, ~1–1.5s STT,
~2–3s agent call. That reads as natural interview pacing.

### Why one blob per utterance

`MediaRecorder.start(250)` emits chunks, but **only the first carries the WebM
header** — later chunks aren't independently decodable, so an STT provider
can't transcribe them standalone. Recording one complete blob per utterance
sidesteps this entirely.

It also gives per-question media slicing for free: each blob is already
bounded at exactly the turn boundary that matters, so nothing ever needs byte
offsets into a monolithic file.

## Model proposes, code disposes

The single most important idea here.

`runInterviewTurn()` ([src/lib/ai/interviewer.ts](../src/lib/ai/interviewer.ts))
makes one **forced tool call** per turn, returning both what to say and what to
do:

```
submit_turn({
  utterance,            // exact text shown to the candidate
  decision,             // follow_up | next_question | end_interview
  decision_rationale,   // audit trail, never shown live
  coverage_notes        // what the answer did/didn't cover → fed to scoring
})
```

Nothing downstream parses prose.

`applyDecision()`
([src/lib/interview/state-machine.ts](../src/lib/interview/state-machine.ts))
then **disposes**. It enforces invariants the model must not be trusted with:

- max 2 follow-ups per question
- a turn cap scaled to agenda length (`maxTurnsFor()`)
- always advance after the last question; never revisit a closed one

If the model asks to probe a third time, code overrides it to
`next_question`. This is where interview quality actually lives.

**When code overrides a decision, it must also replace the words.** The
model's utterance was written for the decision it *wanted*. Reusing it after
an override showed candidates a normal-looking follow-up immediately before
the interview stopped dead. `submitTurn()` substitutes a deterministic line
whenever `outcome.override` is non-null.

### Two passes, never one

Asking a single call to be a warm conversational interviewer *and* a rigorous
grader produces mediocre results at both.

| | Live pass | Scoring pass |
|---|---|---|
| When | Every turn | Once, after the session |
| Model | `claude-opus-5`, low effort, adaptive thinking **on** | `claude-sonnet-5` |
| Sees | Text only | Transcript + reference answer + sampled frames + rubric |
| Job | Talk and route | Score against `PARAMETER_WEIGHTS` |

Thinking stays **on** for the live pass deliberately: with it disabled this
model can emit a tool call as plain text — the turn "succeeds", the tool never
runs, and routing silently breaks.

The live system prompt carries a `cache_control` breakpoint and must stay
**byte-stable** across a session. No timestamps, no "question 3 of 6", no
interpolation. Volatile per-turn state goes in a separate mid-conversation
system message, which preserves the cached prefix.

## Media capture

Browser-native. No WebRTC, no video vendor.

[`useInterviewRecorder`](../src/hooks/useInterviewRecorder.ts) owns the
`MediaStream`:

- **Audio** — a per-turn `MediaRecorder` over
  `new MediaStream(stream.getAudioTracks())`, opus @ 48kbps
- **Frames** — `drawImage()` from the live `<video>` element onto a canvas,
  then `toBlob('image/jpeg', 0.7)`, every 3s, capped at 6/turn

**The turn recorder is audio-only, and that costs scoring nothing.** Frames
don't come from the recorder — they're drawn off the canvas independently, and
`scoreAnswer()` has no video field at all. A 30s turn is ~180KB as audio
versus ~1.7MB with video: 9x less on the latency-critical upload path, for
zero loss of signal.

Uploads go straight from the browser to Storage:

| Bucket | Path | Contents |
|---|---|---|
| `recordings` | `{userId}/{sessionId}/turn-{n}.webm` | per-turn audio |
| `frames` | `{userId}/{sessionId}/turn-{n}/frame-{i}.jpg` | sampled stills |
| `resumes` | `{userId}/...` | uploaded PDFs |

RLS keys off the first path segment being `auth.uid()`, so no new policy is
needed per feature.

Frames are deleted automatically once every question in a session is scored
(`purgeSessionFrames()`), since nothing renders them afterwards.

## From turns back to answers

Live mode breaks batch mode's clean 1:1 mapping: one planned question may be
answered across an opening turn plus two follow-ups.

[`assembleQuestionMedia()`](../src/lib/interview/assemble-question-media.ts)
gathers `live_turns` for a question and produces exactly the four fields
`scoreAnswer()` takes:

- **questionText** — the planned question **plus the follow-ups actually
  asked**, so the rubric judges against what was really asked
- **referenceAnswer** — straight off `session_questions`
- **transcript** — candidate turns joined in order, speaker-labelled
- **frames** — union of those turns' frames, evenly downsampled to
  `MAX_FRAMES` (8)

That cap is load-bearing: 3 turns × 6 frames = 18 images, and at high-res
vision pricing each runs ~4.7K tokens, which would dominate the call.

Because assembly writes **one `answers` row per planned question**,
`maybeFinalizeSession()` and every dashboard aggregation work unchanged.

## Data model

Postgres, RLS scoped to `auth.uid()` throughout.

| Table | Role |
|---|---|
| `profiles` | 1:1 with `auth.users`; targets, resume, onboarding flags, `is_admin` |
| `question_bank` | Curated shared questions + provenance (`source`, `grounding_notes`, `verification_verdict`) |
| `interview_sessions` | `mode` (batch/live), `interview_type`, status, scores |
| `session_questions` | The planned agenda; reference answers **copied at creation** so grounding is stable |
| `live_turns` | Per-turn transcript, audio path, frames, decision + rationale |
| `answers` | One scored row per planned question |
| `custom_questions` / `domain_questions` | JD-generated and resume-generated question sets |

Two deliberate design points:

**Follow-ups are turns, not questions.** That's what keeps the agenda, the
scoring pass, and every aggregation simple.

**`interview_type` records the content source** — `jd_based`, `resume_based`,
`hr_mixed` etc. `mode` records delivery. They're orthogonal on purpose: live
composes with any source.

Inert seams exist and are written but unused: `client_signals`,
`integrity_flags`, and `live_turns.started_at_ms`/`ended_at_ms` (which will
map a question to a playback range once continuous video recording ships).

## Question sourcing

All three paths converge on `launchLiveSession()`, which persists the session
and agenda, generates the opening turn, and redirects.

- **Curated bank** — `selectSessionQuestions()` filters by role/company/type,
  then round-robins across subjects. Role matching is deliberately fuzzy
  (free-text "Senior SDE" must reach a row tagged `sde`); **company matching
  is token-based**, because raw substring matching made `ey` match `mckinsey`.
- **Job description** — analyse the posting, generate questions with reference
  answers up front, store in `custom_questions` for provenance.
- **Resume** — a richer structured extraction (projects, technologies,
  metrics) than onboarding's, cached in `domain_questions` and invalidated
  when a new resume is uploaded.

The curated bank is built by a three-pass pipeline — research (web search) →
generate → **verify with a separate call that has no memory of authoring the
questions**. Only `grounded` and `plausible` verdicts are inserted.

## Known limitations

- **Live sessions have no video on disk.** Audio, frame stills and transcripts
  only. Continuous recording and results-page playback ship together as one
  deferred unit, using the `started_at_ms`/`ended_at_ms` seam.
- **The conversation history isn't cached.** The system prompt caches
  correctly, but `messages[]` has no `cache_control`, so the transcript is
  re-billed every turn. That's the main driver of live mode's cost
  (~$0.31/interview vs ~$0.12 batch).
- **The question-bank verifier is too lenient** — it rejected 0 of 600 in the
  last batch.
- **No background job queue.** Scoring runs via `after()` in the request
  lifecycle; a crash mid-scoring needs `retryLiveScoring()`.
