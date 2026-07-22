import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";
import type { Difficulty, QuestionType } from "@/lib/supabase/types";

const DOMAIN_SUBJECTS = ["projects", "skills", "experience"] as const;
export type DomainSubject = (typeof DOMAIN_SUBJECTS)[number];

const VALID_QUESTION_TYPES: QuestionType[] = [
  "behavioral",
  "technical",
  "hr",
  "resume_followup",
];
const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export interface ResumeProject {
  name: string;
  description: string;
  technologies: string[];
  metrics: string[];
}

export interface DomainResumeAnalysis {
  projects: ResumeProject[];
  skills: string[];
  experience_highlights: string[];
}

export interface GeneratedDomainQuestion {
  subject: DomainSubject;
  question_text: string;
  reference_answer: string;
  question_type: QuestionType;
  difficulty: Difficulty;
}

const ANALYZE_DOMAIN_RESUME_TOOL = {
  name: "submit_domain_resume_analysis",
  description:
    "Submit a structured, project-level analysis of a resume for generating resume-grounded mock-interview questions.",
  input_schema: {
    type: "object" as const,
    properties: {
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            technologies: { type: "array", items: { type: "string" } },
            metrics: {
              type: "array",
              items: { type: "string" },
              description:
                "Quantified claims stated for this project, verbatim-ish (e.g. 'reduced latency by 40%', 'led a team of 5')",
            },
          },
          required: ["name", "description", "technologies", "metrics"],
        },
      },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Concrete technologies/tools/skills claimed anywhere in the resume",
      },
      experience_highlights: {
        type: "array",
        items: { type: "string" },
        description:
          "Notable internship/work/leadership claims worth probing that aren't tied to a specific project above",
      },
    },
    required: ["projects", "skills", "experience_highlights"],
  },
};

export async function analyzeResumeForDomainInterview(
  resumeText: string
): Promise<DomainResumeAnalysis> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    tools: [ANALYZE_DOMAIN_RESUME_TOOL],
    tool_choice: { type: "tool", name: ANALYZE_DOMAIN_RESUME_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Analyze this resume in detail, at the project level, so specific follow-up interview questions can be generated from it later.

Extract:
1. "projects": every distinct project mentioned, each with its name, a brief description, the specific technologies/tools used, and any quantified metrics/achievements claimed for it (e.g. "reduced latency by 40%", "processed 1M+ records/day").
2. "skills": a flat list of concrete technologies/tools/skills claimed anywhere in the resume.
3. "experience_highlights": notable internship/work/leadership claims worth probing that aren't already captured under a specific project.

Resume text:
${resumeText.slice(0, 15000)}`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured resume analysis");
  }

  const input = toolUse.input as DomainResumeAnalysis;

  if (
    (!Array.isArray(input.projects) || input.projects.length === 0) &&
    (!Array.isArray(input.experience_highlights) || input.experience_highlights.length === 0)
  ) {
    throw new Error(
      "Could not identify any projects or experience to generate questions from"
    );
  }

  return {
    projects: Array.isArray(input.projects) ? input.projects : [],
    skills: Array.isArray(input.skills) ? input.skills : [],
    experience_highlights: Array.isArray(input.experience_highlights)
      ? input.experience_highlights
      : [],
  };
}

export async function generateDomainQuestions(
  analysis: DomainResumeAnalysis,
  questionsPerSubject: number
): Promise<GeneratedDomainQuestion[]> {
  const totalQuestions = DOMAIN_SUBJECTS.length * questionsPerSubject;

  const tool = {
    name: "submit_domain_questions",
    description:
      "Submit generated mock-interview questions with reference answers, grounded in a specific resume's projects/skills/experience.",
    input_schema: {
      type: "object" as const,
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: totalQuestions,
          items: {
            type: "object",
            properties: {
              subject: { type: "string", enum: [...DOMAIN_SUBJECTS] },
              question_text: { type: "string" },
              reference_answer: {
                type: "string",
                description:
                  "What a strong, specific elaboration should cover, grounded ONLY in what this resume already states - not a generic model answer, since there's no universal correct answer for a personal question.",
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
    max_tokens: 10000,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `Generate up to ${questionsPerSubject} mock-interview questions for EACH of these subjects: ${DOMAIN_SUBJECTS.join(", ")} (up to ${totalQuestions} total), grounded in this specific candidate's resume:

Projects:
${JSON.stringify(analysis.projects, null, 2)}

Skills: ${analysis.skills.join(", ") || "none listed"}

Experience highlights:
${analysis.experience_highlights.join("\n") || "none listed"}

Critical requirements:
- Every question must name a SPECIFIC project, technology, or metric already stated above (e.g. "You mention reducing API latency by 40% in the Order Service project - walk me through how you identified the bottleneck and measured that improvement") - never ask a generic "tell me about a project you worked on" question that could apply to anyone's resume.
- "projects" subject questions should probe the specific projects listed above (their described metrics, technology choices, design decisions).
- "skills" subject questions should probe depth on specific claimed skills/technologies (not project-specific).
- "experience" subject questions should probe the experience_highlights (internships, leadership, work history).
- If a subject has little to draw from (e.g. few or no experience_highlights), generate fewer questions for it rather than inventing generic filler - it is fine to produce fewer than ${questionsPerSubject} for a thin subject.
- Each "reference_answer" must describe what a strong, SPECIFIC elaboration should cover, grounded only in what the resume already states - these are personal/behavioral questions with no universal correct answer, just a bar for specificity and consistency with the resume's own claims.
- Assign "difficulty" and vary "question_type" appropriately per question.`,
      },
    ],
  });

  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Response was cut off generating questions - resume may be too long"
    );
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return structured domain questions");
  }

  const input = toolUse.input as { questions?: GeneratedDomainQuestion[] };
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error(
      "Claude returned an empty or malformed question set - please try again"
    );
  }

  const normalized = input.questions
    .filter((q) => q.subject && q.question_text && q.reference_answer)
    .map((q) => ({
      ...q,
      subject: DOMAIN_SUBJECTS.includes(q.subject) ? q.subject : "projects",
      question_type: VALID_QUESTION_TYPES.includes(q.question_type)
        ? q.question_type
        : "resume_followup",
      difficulty: VALID_DIFFICULTIES.includes(q.difficulty) ? q.difficulty : "medium",
    }));

  if (normalized.length === 0) {
    throw new Error(
      "Claude returned an empty or malformed question set - please try again"
    );
  }

  return normalized;
}
