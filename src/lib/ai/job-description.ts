import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";
import {
  KNOWN_SUBJECTS,
  KNOWN_ROLES,
  KNOWN_COMPANIES,
} from "@/lib/ai/resume";
import type { Difficulty, QuestionType } from "@/lib/supabase/types";

const KNOWN_SENIORITY = ["intern", "entry_level", "mid", "senior", "staff_plus"];
const VALID_QUESTION_TYPES: QuestionType[] = [
  "behavioral",
  "technical",
  "hr",
  "resume_followup",
];
const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export interface JobDescriptionAnalysis {
  role: string;
  company: string | null;
  seniority: string;
  required_skills: string[];
  subjects: string[];
}

export interface GeneratedCustomQuestion {
  subject: string;
  question_text: string;
  reference_answer: string;
  question_type: QuestionType;
  difficulty: Difficulty;
}

const ANALYZE_JD_TOOL = {
  name: "submit_jd_analysis",
  description:
    "Submit a structured analysis of a pasted job description for placement-interview preparation.",
  input_schema: {
    type: "object" as const,
    properties: {
      role: { type: "string" },
      company: {
        type: "string",
        description: "Empty string if no specific company is named in the posting",
      },
      seniority: {
        type: "string",
        description: `Prefer one of: ${KNOWN_SENIORITY.join(", ")} where plausible, otherwise free text`,
      },
      required_skills: {
        type: "array",
        items: { type: "string" },
        description:
          "Concrete technologies/languages/tools named in the posting (e.g. Java, Spring Boot, SQL) - not generic terms",
      },
      subjects: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: { type: "string" },
        description: `Prefer this known vocabulary where it genuinely fits: ${KNOWN_SUBJECTS.join(", ")}. If the posting's actual subject matter isn't well covered by any of these (e.g. devops, cloud_infrastructure, machine_learning, mobile_development), invent a new lowercase snake_case subject tag instead of force-fitting it into an ill-fitting existing one.`,
      },
    },
    required: ["role", "company", "seniority", "required_skills", "subjects"],
  },
};

export async function analyzeJobDescription(
  jdText: string
): Promise<JobDescriptionAnalysis> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    tools: [ANALYZE_JD_TOOL],
    tool_choice: { type: "tool", name: ANALYZE_JD_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Analyze this pasted job description for placement-interview preparation.

Known role vocabulary (prefer these for "role" where plausible, otherwise use free text): ${KNOWN_ROLES.join(", ")}.
Known company vocabulary (prefer these for "company" where plausible, otherwise use free text): ${KNOWN_COMPANIES.join(", ")}.
Known subject vocabulary (prefer these for "subjects" where they genuinely fit): ${KNOWN_SUBJECTS.join(", ")}.

Extract:
1. "role": the job title/role being hired for.
2. "company": the hiring company if named, else empty string.
3. "seniority": the experience level implied by the posting.
4. "required_skills": concrete technologies/languages/tools explicitly named (e.g. "Java", "React", "PostgreSQL") - be specific, not generic.
5. "subjects": which subjects this posting's interview would plausibly cover, based on its actual content. Prefer the known vocabulary above where it genuinely fits, but if the posting is about something the known vocabulary doesn't cover well (e.g. DevOps, cloud infrastructure, machine learning, mobile development, data engineering), invent a new lowercase snake_case subject tag for it instead of squeezing it into an ill-fitting existing one. Never force-fit a subject just because it's on the known list.

Job description text:
${jdText.slice(0, 15000)}`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured job description analysis");
  }

  const input = toolUse.input as {
    role: string;
    company: string;
    seniority: string;
    required_skills: string[];
    subjects: string[];
  };

  if (!Array.isArray(input.subjects) || input.subjects.length === 0) {
    // generateCustomQuestions builds its tool schema's subject enum directly
    // from this list - an empty list means an unsatisfiable enum, which is
    // the likely cause of malformed downstream generations.
    throw new Error(
      "Could not identify any relevant subjects from that job description"
    );
  }

  return {
    role: input.role,
    company: input.company || null,
    seniority: input.seniority,
    required_skills: input.required_skills,
    subjects: input.subjects,
  };
}

export async function generateCustomQuestions(
  analysis: JobDescriptionAnalysis,
  questionsPerSubject: number
): Promise<GeneratedCustomQuestion[]> {
  const totalQuestions = analysis.subjects.length * questionsPerSubject;

  const tool = {
    name: "submit_custom_questions",
    description:
      "Submit generated mock-interview questions with reference answers for a specific job description.",
    input_schema: {
      type: "object" as const,
      properties: {
        questions: {
          type: "array",
          minItems: analysis.subjects.length,
          maxItems: totalQuestions,
          items: {
            type: "object",
            properties: {
              subject: { type: "string", enum: analysis.subjects },
              question_text: { type: "string" },
              reference_answer: {
                type: "string",
                description:
                  "A detailed model answer, specific enough to stand alone as scoring ground truth - this is the only context a later scoring step will have.",
              },
              question_type: {
                type: "string",
                enum: ["behavioral", "technical", "hr", "resume_followup"],
              },
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
            },
            required: [
              "subject",
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
    // Observed ~400-450 output tokens per question+reference-answer pair;
    // the worst case (5 subjects x 3 questions = 15) needs ~6000-6700, so
    // 6000 was cutting it too close and truncating mid-JSON for larger
    // JDs, producing a malformed tool_use input downstream.
    max_tokens: 10000,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `Generate exactly ${questionsPerSubject} mock-interview questions for EACH of these subjects: ${analysis.subjects.join(", ")} (total ${totalQuestions} questions), tailored to this specific job posting:

Role: ${analysis.role}
Company: ${analysis.company ?? "not specified"}
Seniority: ${analysis.seniority}
Required skills: ${analysis.required_skills.join(", ") || "not specified"}

Critical requirements:
- Technical questions must be concrete to the named required skills (e.g. if "Java" is required, ask about JVM memory model, Spring bean lifecycle, concurrency primitives - not generic OOP theory that could apply to any language). Do not produce generic filler that could apply to any posting.
- Each "reference_answer" must be a detailed, self-contained model answer covering the key points a strong candidate would hit - it will be used as the only grounding context when scoring a real candidate's spoken answer later, so vague or one-line answers will silently degrade scoring quality.
- Assign "difficulty" per question based on how demanding it is for the stated seniority level.
- Vary "question_type" appropriately per subject (e.g. hr/behavioral subjects should produce behavioral or hr questions, technical subjects should produce technical questions).`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Response was cut off generating questions - try a shorter job description"
    );
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured custom questions");
  }

  const input = toolUse.input as { questions?: GeneratedCustomQuestion[] };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error(
      "Claude returned an empty or malformed question set - please try again"
    );
  }

  // Tool-use schema compliance isn't perfect across ~15 generated items -
  // drop items missing the fields that can't be sensibly defaulted, and
  // normalize enum-like fields that occasionally come back missing/invalid
  // rather than losing an otherwise-good generation over one bad item.
  const normalized = input.questions
    .filter((q) => q.subject && q.question_text && q.reference_answer)
    .map((q) => ({
      ...q,
      question_type: VALID_QUESTION_TYPES.includes(q.question_type)
        ? q.question_type
        : "technical",
      difficulty: VALID_DIFFICULTIES.includes(q.difficulty) ? q.difficulty : "medium",
    }));

  if (normalized.length === 0) {
    throw new Error(
      "Claude returned an empty or malformed question set - please try again"
    );
  }

  return normalized;
}
