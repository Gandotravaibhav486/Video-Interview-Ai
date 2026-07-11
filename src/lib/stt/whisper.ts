import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(
  videoBuffer: Buffer,
  filename = "answer.webm"
): Promise<string> {
  const file = await toFile(videoBuffer, filename);
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return transcription.text.trim();
}
