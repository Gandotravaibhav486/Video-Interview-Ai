import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";
import type { InterviewType, SuggestedInterview } from "@/lib/supabase/types";

export interface ProfileDefaults {
  full_name: string | null;
  target_role: string;
  target_companies: string[];
}

export interface ResumeAnalysis {
  summary: string;
  skills: string[];
  suggested_interviews: SuggestedInterview[];
  profile_defaults: ProfileDefaults;
}

export const KNOWN_SUBJECTS = [
  "dsa",
  "oops",
  "dbms",
  "operating_systems",
  "computer_networks",
  "aptitude",
  "hr",
  "communication",
  "system_design",
];
export const KNOWN_ROLES = ["sde", "software_engineer", "business_analyst"];
export const KNOWN_COMPANIES = ["tcs", "infosys", "wipro", "accenture", "amazon", "google"];

const ANALYZE_RESUME_TOOL = {
  name: "submit_resume_analysis",
  description:
    "Submit a structured analysis of a student's resume for placement-interview preparation.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      skills: { type: "array", items: { type: "string" } },
      suggested_interviews: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            company: {
              type: "string",
              description: "Empty string if no specific company applies",
            },
            interview_type: {
              type: "string",
              enum: ["behavioral", "technical", "hr_mixed", "company_specific"],
            },
            subjects: {
              type: "array",
              items: { type: "string" },
              description: `Prefer this known vocabulary where it genuinely fits: ${KNOWN_SUBJECTS.join(", ")}. If the resume's actual content isn't well covered by any of these (e.g. machine_learning, data_engineering, cloud_infrastructure, mobile_development), invent a new lowercase snake_case subject tag instead of force-fitting it into an ill-fitting existing one.`,
            },
            rationale: { type: "string" },
          },
          required: ["role", "company", "interview_type", "subjects", "rationale"],
        },
      },
      profile_defaults: {
        type: "object",
        properties: {
          full_name: {
            type: "string",
            description: "Empty string if not clearly identifiable in the resume",
          },
          target_role: { type: "string" },
          target_companies: { type: "array", items: { type: "string" } },
        },
        required: ["full_name", "target_role", "target_companies"],
      },
    },
    required: ["summary", "skills", "suggested_interviews", "profile_defaults"],
  },
};

export async function analyzeResume(resumeText: string): Promise<ResumeAnalysis> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    tools: [ANALYZE_RESUME_TOOL],
    tool_choice: { type: "tool", name: ANALYZE_RESUME_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Analyze this student's resume for placement-interview preparation.

Known subject vocabulary (prefer these for "subjects" where they genuinely fit): ${KNOWN_SUBJECTS.join(", ")}. If a suggestion's actual content isn't well covered by any of these (e.g. machine_learning, data_engineering, cloud_infrastructure, mobile_development), invent a new lowercase snake_case subject tag for it rather than squeezing it into an ill-fitting existing one.
Known role vocabulary (prefer these for "role"/"target_role" where plausible, otherwise use free text): ${KNOWN_ROLES.join(", ")}.
Known company vocabulary (prefer these for "company"/"target_companies" where plausible, otherwise use free text): ${KNOWN_COMPANIES.join(", ")}.

Produce:
1. "summary": a factual, no-filler summary under 200 words (key skills, projects with measurable impact, work/internship experience) for use as interview-prep context.
2. "skills": a flat list of extracted keywords (technologies, tools, domains, methodologies).
3. "suggested_interviews": 2-4 DISTINCT mock-interview suggestions covering different angles (e.g. one DSA/technical-heavy, one HR/behavioral, one company-specific if a target company is inferable from the resume) - avoid near-duplicate suggestions. Each needs a short rationale tied to specific resume content.
4. "profile_defaults": the single best-fit summary profile (full_name only if clearly identifiable in the resume text itself, target_role, target_companies).

Resume text:
${resumeText.slice(0, 15000)}`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured resume analysis");
  }

  const input = toolUse.input as {
    summary: string;
    skills: string[];
    suggested_interviews: {
      role: string;
      company: string;
      interview_type: InterviewType;
      subjects: string[];
      rationale: string;
    }[];
    profile_defaults: {
      full_name: string;
      target_role: string;
      target_companies: string[];
    };
  };

  return {
    summary: input.summary,
    skills: input.skills,
    suggested_interviews: input.suggested_interviews.map((s) => ({
      role: s.role,
      company: s.company || null,
      interview_type: s.interview_type,
      subjects: s.subjects,
      rationale: s.rationale,
    })),
    profile_defaults: {
      full_name: input.profile_defaults.full_name || null,
      target_role: input.profile_defaults.target_role,
      target_companies: input.profile_defaults.target_companies,
    },
  };
}
