import OpenAI from "openai";
import { toFile } from "openai/uploads";

// Groq's API is OpenAI-compatible, so the "openai" SDK works unmodified
// against Groq's endpoint - this gives free-tier Whisper transcription
// without an OpenAI account.
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function transcribeAudio(
  videoBuffer: Buffer,
  filename = "answer.webm"
): Promise<string> {
  const file = await toFile(videoBuffer, filename);
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
  });
  return transcription.text.trim();
}
