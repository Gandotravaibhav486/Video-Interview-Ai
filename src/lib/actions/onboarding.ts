"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { summarizeResume } from "@/lib/ai/resume";
import type { ExperienceLevel, Profile } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const targetRole = String(formData.get("target_role") ?? "").trim();
  const targetCompanies = parseList(formData.get("target_companies"));
  const experienceLevel = String(
    formData.get("experience_level") ?? "campus_fresher"
  ) as ExperienceLevel;
  const resumeFile = formData.get("resume") as File | null;

  const update: Partial<Profile> = {
    full_name: fullName,
    target_role: targetRole,
    target_companies: targetCompanies,
    experience_level: experienceLevel,
  };

  if (resumeFile && resumeFile.size > 0) {
    const path = `${user!.id}/resume.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(path, resumeFile, { upsert: true, contentType: "application/pdf" });
    if (uploadError) throw new Error(uploadError.message);

    update.resume_url = path;

    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: await resumeFile.arrayBuffer() });
      const parsed = await parser.getText();
      update.resume_parsed_summary = await summarizeResume(parsed.text);
    } catch {
      // resume text extraction/summarization is a best-effort enhancement;
      // onboarding should still succeed without it.
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user!.id);
  if (error) throw new Error(error.message);

  redirect("/dashboard");
}
