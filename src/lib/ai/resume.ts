import { anthropic, CLAUDE_MODEL } from "@/lib/ai/anthropic";

export async function summarizeResume(resumeText: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `Summarize this resume in under 200 words for use as interview-prep context: key skills, projects with measurable impact, and work/internship experience. Be factual, no filler.\n\n${resumeText.slice(0, 15000)}`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
