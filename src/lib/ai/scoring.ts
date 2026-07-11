import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";
import { PARAMETER_WEIGHTS, weightedOverallScore } from "@/lib/scoring/weights";
import type { ScoreBreakdown } from "@/lib/supabase/types";

export interface FrameImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png";
}

export interface ScoreAnswerParams {
  questionText: string;
  referenceAnswer: string;
  transcript: string;
  frames: FrameImage[];
}

export interface AnswerScoreResult {
  scoreBreakdown: ScoreBreakdown;
  overallScore: number;
  feedback: string;
}

const SCORE_TOOL = {
  name: "submit_answer_score",
  description:
    "Submit structured scores (0-100) and qualitative notes for a candidate's mock interview answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      content_relevance: { type: "integer", minimum: 0, maximum: 100 },
      content_relevance_notes: { type: "string" },
      delivery_confidence: { type: "integer", minimum: 0, maximum: 100 },
      delivery_confidence_notes: { type: "string" },
      communication_clarity: { type: "integer", minimum: 0, maximum: 100 },
      communication_clarity_notes: { type: "string" },
      professionalism_appearance: { type: "integer", minimum: 0, maximum: 100 },
      professionalism_appearance_notes: { type: "string" },
      body_language: { type: "integer", minimum: 0, maximum: 100 },
      body_language_notes: { type: "string" },
      overall_feedback: { type: "string" },
    },
    required: [
      "content_relevance",
      "content_relevance_notes",
      "delivery_confidence",
      "delivery_confidence_notes",
      "communication_clarity",
      "communication_clarity_notes",
      "professionalism_appearance",
      "professionalism_appearance_notes",
      "body_language",
      "body_language_notes",
      "overall_feedback",
    ],
  },
};

export async function scoreAnswer({
  questionText,
  referenceAnswer,
  transcript,
  frames,
}: ScoreAnswerParams): Promise<AnswerScoreResult> {
  const imageBlocks = frames.map((frame) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: frame.mediaType,
      data: frame.base64,
    },
  }));

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: SCORE_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an interview coach scoring a student's mock placement-interview answer.

Question: ${questionText}

Reference (ideal) answer, for grounding your assessment of content accuracy/completeness — do not require verbatim match, judge whether the key points were covered:
${referenceAnswer}

Candidate's spoken answer (transcript):
${transcript || "(no speech detected)"}

The images below are frames sampled from the candidate's webcam during their answer, in chronological order. Use them to assess posture, attire/professionalism, and expression/engagement.

Score each parameter 0-100 with brief notes, and a short overall_feedback paragraph (2-3 sentences) that is constructive and specific.`,
          },
          ...imageBlocks,
        ],
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured score");
  }

  const input = toolUse.input as Record<string, string | number>;

  const scoreBreakdown: ScoreBreakdown = {};
  for (const key of Object.keys(PARAMETER_WEIGHTS)) {
    scoreBreakdown[key] = {
      score: Number(input[key] ?? 0),
      weight: PARAMETER_WEIGHTS[key].weight,
      label: PARAMETER_WEIGHTS[key].label,
    };
  }

  const scores = Object.fromEntries(
    Object.entries(scoreBreakdown).map(([k, v]) => [k, v.score])
  );

  const notes = Object.keys(PARAMETER_WEIGHTS)
    .map((key) => `${PARAMETER_WEIGHTS[key].label}: ${input[`${key}_notes`] ?? ""}`)
    .join("\n");

  return {
    scoreBreakdown,
    overallScore: weightedOverallScore(scores),
    feedback: `${input.overall_feedback ?? ""}\n\n${notes}`.trim(),
  };
}

export interface QuestionFeedbackSummary {
  questionText: string;
  subject: string;
  feedback: string;
}

export async function summarizeSession(
  items: QuestionFeedbackSummary[]
): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Write a 3-4 sentence overall summary of this student's mock interview performance, based on the per-question feedback below. Be encouraging but specific about the top 1-2 areas to improve.\n\n${items
          .map((i) => `Subject: ${i.subject}\nQuestion: ${i.questionText}\nFeedback: ${i.feedback}`)
          .join("\n\n")}`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
