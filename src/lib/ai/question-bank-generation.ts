import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";
import { KNOWN_SUBJECTS } from "@/lib/ai/resume";
import type { Difficulty, QuestionType, VerificationVerdict } from "@/lib/supabase/types";

// Three deliberately separate passes: research (web-grounded), generate, then
// verify. One call asked to research, invent, and self-police does all three
// badly - the verifier in particular has to be a fresh context with no memory
// of having authored the questions, or it just rubber-stamps its own work.

const VALID_QUESTION_TYPES: QuestionType[] = [
  "behavioral",
  "technical",
  "hr",
  "resume_followup",
];
const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const VALID_VERDICTS: VerificationVerdict[] = ["grounded", "plausible", "rejected"];

// Opus for the two judgement-heavy passes (deciding what a company actually
// asks, and policing whether a question is really grounded). Sonnet stays on
// bulk generation, matching the JD/domain generators.
const JUDGEMENT_MODEL = "claude-opus-5";

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Token accounting. Generation is the most expensive thing this app does -
 * three calls per pairing, two of them Opus with web search - so each pass
 * reports what it spent and the caller totals it.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** USD, estimated from the per-model rates below. */
  costUsd: number;
}

// $/1M tokens. Sonnet 5 is on introductory pricing ($2/$10) through
// 2026-08-31, after which it reverts to $3/$15 - update then.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function readUsage(model: string, usage: UsageLike | undefined): TokenUsage {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const rate = PRICING[model] ?? { input: 0, output: 0 };
  // Cache reads bill at ~0.1x input, writes at ~1.25x.
  const costUsd =
    (input * rate.input +
      cacheRead * rate.input * 0.1 +
      cacheWrite * rate.input * 1.25 +
      output * rate.output) /
    1_000_000;
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

export interface RoleCompanyResearch {
  /** Free-text findings, persisted verbatim into question_bank.grounding_notes. */
  notes: string;
  usage: TokenUsage;
}

export interface GeneratedBankQuestion {
  subject: string;
  /** Fine-grained skills tested, matched against profiles.resume_skills. */
  skills: string[];
  question_text: string;
  reference_answer: string;
  question_type: QuestionType;
  difficulty: Difficulty;
}

export interface QuestionVerdict {
  index: number;
  verdict: VerificationVerdict;
  reason: string;
}

/**
 * Pass 1: what is publicly documented about how this company interviews for
 * this role. Uses the web search server tool, so no forced tool_choice here -
 * forcing a tool would stop the model from searching at all.
 */
export async function researchRoleCompanyPatterns(
  role: string,
  company: string | null
): Promise<RoleCompanyResearch> {
  const target = company ? `${role} roles at ${company}` : `${role} roles`;

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    {
      role: "user",
      content: `Research how ${target} are actually interviewed, for an Indian campus-placement interview practice product.

Search for publicly documented information and report:
1. Round structure - what rounds candidates go through, in order.
2. Subject emphasis - which topics dominate, and which barely appear.
3. Question style - the actual shape of questions (e.g. leadership-principle STAR behaviourals, timed aptitude puzzles, whiteboard DSA, case/stakeholder scenarios).
4. Difficulty calibration for a fresher/early-career candidate.
5. Sources - which pages you drew this from.

Be concrete and specific to ${company ?? "this role"}. If you cannot find company-specific evidence, say so explicitly rather than describing generic interview practice as though it were documented for this company - a later verification step depends on knowing which claims are actually evidenced.`,
    },
  ];

  let message = await anthropic.messages.create({
    model: JUDGEMENT_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages: messages as never,
  });
  // Every continuation is separately billed, so usage accumulates across the
  // whole loop rather than reading only the final message.
  let usage = readUsage(JUDGEMENT_MODEL, message.usage);

  // The server-side search loop caps its own iterations; pause_turn means it
  // stopped early and wants to continue. Re-send rather than treating the
  // partial research as final.
  let continuations = 0;
  while (message.stop_reason === "pause_turn" && continuations < 3) {
    messages.push({ role: "assistant", content: message.content });
    message = await anthropic.messages.create({
      model: JUDGEMENT_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages: messages as never,
    });
    usage = addUsage(usage, readUsage(JUDGEMENT_MODEL, message.usage));
    continuations += 1;
  }

  const notes = sanitize(
    message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
  );

  if (!notes) {
    throw new Error(`Research pass returned nothing for ${role}/${company ?? "any"}`);
  }

  return { notes, usage };
}

/**
 * Strips tool-call scaffolding that leaks into research prose during the
 * web-search loop (observed verbatim: a citation ending in `</parameter>
 * </invoke>`). Worth doing here specifically because these notes are both
 * persisted to grounding_notes and re-injected into the generation and
 * verification prompts - garbage here propagates three ways.
 */
function sanitize(value: string): string {
  return value
    .replace(/<\/?antml[^>]*>/gi, "")
    .replace(/<\/?invoke[^>]*>/gi, "")
    .replace(/<\/?parameter[^>]*>/gi, "")
    .replace(/<\/?thinking[^>]*>/gi, "")
    .trim();
}

/** Pass 2: generate candidate questions grounded in the research findings. */
export async function generateBankQuestions(
  role: string,
  company: string | null,
  research: RoleCompanyResearch,
  count: number
): Promise<{ questions: GeneratedBankQuestion[]; usage: TokenUsage }> {
  const tool = {
    name: "submit_bank_questions",
    description:
      "Submit interview questions with reference answers for a role and company.",
    input_schema: {
      type: "object" as const,
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: count,
          items: {
            type: "object",
            properties: {
              subject: {
                type: "string",
                description: `Prefer this vocabulary where it genuinely fits: ${KNOWN_SUBJECTS.join(", ")}. If this role's real subject matter isn't covered by any of them (e.g. business_analysis, data_analysis, testing, devops, product_sense), use a new lowercase snake_case tag rather than force-fitting.`,
              },
              skills: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: { type: "string" },
                description:
                  "The specific skills this question tests, finer-grained than subject. Lowercase snake_case, named the way they'd appear on a resume (e.g. sql, joins, normalization, dynamic_programming, stakeholder_management, requirement_gathering). These are matched against skills extracted from candidate resumes, so use the conventional name for the skill rather than a description of the question.",
              },
              question_text: { type: "string" },
              reference_answer: {
                type: "string",
                description:
                  "A detailed model answer, self-contained enough to stand alone as scoring ground truth - it is the only context the scoring step will have.",
              },
              question_type: {
                type: "string",
                enum: ["behavioral", "technical", "hr", "resume_followup"],
              },
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            },
            required: [
              "subject",
              "skills",
              "question_text",
              "reference_answer",
              "question_type",
              "difficulty",
            ],
          },
        },
      },
      required: ["questions"],
    },
  };

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `Write exactly ${count} mock-interview questions for ${role}${company ? ` at ${company}` : ""}, for Indian campus-placement practice.

Ground every question in these researched findings about how this company/role actually interviews:

${research.notes}

Requirements:
- Every question must test the competencies of a ${role}. This is non-negotiable and outranks company fidelity: if the research says ${company ?? "this employer"} does not hire ${role}s from campus, or only documents a *different* role's process, write questions appropriate to a ${role} anyway and let them be judged as generic-for-the-role. Do NOT substitute the other role's questions. A DSA or OOP question tagged as a ${role} question is a failure, no matter how well evidenced it is for some other role at the same company.
- Within that constraint, match the documented round structure and question style above. If the research says this company runs leadership-principle behaviourals, write leadership-principle behaviourals - not generic "tell me about a project".
- Spread questions across the subjects the research says actually get tested for THIS role, weighted toward the ones it says dominate.
- Each reference_answer must be a detailed, self-contained model answer covering what a strong candidate would hit. It is the sole grounding context when scoring a real spoken answer later, so a vague one silently degrades scoring.
- Calibrate difficulty to a fresher/early-career candidate.
- Questions must be answerable out loud in a spoken interview. No "you are shown a grid", no "here is a code snippet" - the candidate only hears the question.
- Do NOT invent company-specific detail the research did not support. A question that is reasonable for the role generally is fine; a question that falsely implies "this is what ${company ?? "they"} asks" is not. A separate verification step will check this.`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error("Response was cut off generating questions - try a smaller count");
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured questions");
  }

  const input = toolUse.input as { questions?: GeneratedBankQuestion[] };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error("Claude returned an empty or malformed question set");
  }

  const normalized = input.questions
    .filter((q) => q.subject && q.question_text && q.reference_answer)
    .map((q) => ({
      ...q,
      subject: normalizeTag(q.subject),
      // Normalized the same way as subject so they actually match
      // profiles.resume_skills, which onboarding stores in the same shape.
      skills: Array.isArray(q.skills)
        ? Array.from(new Set(q.skills.map(normalizeTag).filter(Boolean)))
        : [],
      question_type: VALID_QUESTION_TYPES.includes(q.question_type)
        ? q.question_type
        : "technical",
      difficulty: VALID_DIFFICULTIES.includes(q.difficulty) ? q.difficulty : "medium",
    }));

  if (normalized.length === 0) {
    throw new Error("Claude returned an empty or malformed question set");
  }

  return { questions: normalized, usage: readUsage(CLAUDE_MODEL, message.usage) };
}

/**
 * Pass 3: a fresh call judges each question against the research. Separate
 * from generation on purpose - a model asked to police questions it just wrote
 * grades its own homework. Only 'grounded' and 'plausible' get inserted.
 */
export async function verifyBankQuestions(
  role: string,
  company: string | null,
  research: RoleCompanyResearch,
  questions: GeneratedBankQuestion[]
): Promise<{ verdicts: QuestionVerdict[]; usage: TokenUsage }> {
  const tool = {
    name: "submit_verdicts",
    description:
      "Submit a grounding verdict for each candidate interview question.",
    input_schema: {
      type: "object" as const,
      properties: {
        verdicts: {
          type: "array",
          minItems: questions.length,
          maxItems: questions.length,
          items: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                description: "0-based index of the question being judged.",
              },
              verdict: {
                type: "string",
                enum: ["grounded", "plausible", "rejected"],
              },
              reason: {
                type: "string",
                description: "One sentence justifying the verdict.",
              },
            },
            required: ["index", "verdict", "reason"],
          },
        },
      },
      required: ["verdicts"],
    },
  };

  const numbered = questions
    .map(
      (q, i) =>
        `[${i}] (${q.subject}, ${q.question_type}, ${q.difficulty})\n${q.question_text}`
    )
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: JUDGEMENT_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `You are auditing candidate interview questions someone else wrote for ${role}${company ? ` at ${company}` : ""}. Judge each one honestly - your job is to catch questions that were invented rather than grounded.

Researched findings about how this company/role actually interviews:

${research.notes}

Candidate questions:

${numbered}

Apply these two tests to each question, in order.

TEST 1 - role fidelity (a failure here is always "rejected", however well evidenced the question is):
Does this question test what a ${role} is actually hired for? A question that is thoroughly documented for a DIFFERENT role at ${company ?? "this employer"} still fails: questions get stored tagged as ${role} questions and served to candidates practising for ${role} interviews. Watch specifically for the case where the research found no ${role} process at this company and the writer quietly substituted another role's questions (e.g. software-engineering DSA/OOP/SQL content under a non-engineering role). Reject those.
Also reject anything that cannot be answered out loud - questions referencing a grid, diagram, code snippet, or anything shown on screen.

TEST 2 - grounding (only for questions that passed test 1):
- "grounded": clearly matches the documented interview patterns above for this specific role AND company.
- "plausible": reasonable for a ${role} in general, but the research does not specifically evidence that ${company ?? "this employer"} asks this of ${role} candidates.

Be discriminating. If the research admits it found little evidence for THIS role at THIS company, then almost nothing deserves "grounded" - most should be "plausible", and anything borrowed from another role should be "rejected". Do not inflate verdicts to be agreeable; an audit that approves everything is useless, and the questions you approve go straight into a live product. Return exactly one verdict per question, using the given indices.`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error("Verification response was cut off - try a smaller count");
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured verdicts");
  }

  const input = toolUse.input as { verdicts?: QuestionVerdict[] };
  if (!Array.isArray(input.verdicts)) {
    throw new Error("Claude returned malformed verdicts");
  }

  // An unjudged question is not silently kept - anything the verifier didn't
  // return a usable verdict for is treated as rejected, since the whole point
  // of this pass is that nothing reaches the bank ungated.
  const byIndex = new Map<number, QuestionVerdict>();
  for (const v of input.verdicts) {
    if (
      typeof v.index === "number" &&
      v.index >= 0 &&
      v.index < questions.length &&
      VALID_VERDICTS.includes(v.verdict)
    ) {
      byIndex.set(v.index, { ...v, reason: v.reason ?? "" });
    }
  }

  const resolved = questions.map(
    (_, i) =>
      byIndex.get(i) ?? {
        index: i,
        verdict: "rejected" as const,
        reason: "No usable verdict returned by the verification pass",
      }
  );

  return { verdicts: resolved, usage: readUsage(JUDGEMENT_MODEL, message.usage) };
}
