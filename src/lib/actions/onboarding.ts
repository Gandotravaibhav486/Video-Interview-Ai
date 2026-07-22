"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { analyzeResume } from "@/lib/ai/resume";
import type { Profile } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Step 1 (primary): upload + parse a resume, infer suggested interviews and
// profile defaults from it, then hand off to step 2 for the student to
// review/edit those defaults.
export async function uploadResume(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resumeFile = formData.get("resume") as File | null;
  if (!resumeFile || resumeFile.size === 0) {
    redirect("/onboarding?error=" + encodeURIComponent("Please choose a PDF file"));
  }

  const redirectTo = String(formData.get("redirect_to") ?? "/onboarding");

  const path = `${user!.id}/resume.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, resumeFile!, { upsert: true, contentType: "application/pdf" });
  if (uploadError) throw new Error(uploadError.message);

  // A new resume invalidates any previously generated Domain Interview
  // question set unconditionally (not gated on the analysis below
  // succeeding) - domain_questions must never silently correspond to a
  // resume the student has since replaced.
  await supabase.from("domain_questions").delete().eq("user_id", user!.id);

  const update: Partial<Profile> = {
    resume_url: path,
    resume_prompted: true,
  };
  let parseFailed = false;

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: await resumeFile!.arrayBuffer() });
    const parsed = await parser.getText();
    const analysis = await analyzeResume(parsed.text);

    update.resume_parsed_summary = analysis.summary;
    update.resume_skills = analysis.skills;
    update.suggested_interviews = analysis.suggested_interviews;
    if (analysis.profile_defaults.full_name) {
      update.full_name = analysis.profile_defaults.full_name;
    }
    update.target_role = analysis.profile_defaults.target_role;
    update.target_companies = analysis.profile_defaults.target_companies;
  } catch (err) {
    // Extraction/analysis is best-effort - don't trap the student on a
    // parsing failure. They still land on step 2, just with blank defaults.
    console.error("Resume analysis failed:", err);
    parseFailed = true;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user!.id);
  if (error) throw new Error(error.message);

  const destination = parseFailed
    ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}warning=resume_parse_failed`
    : redirectTo;
  redirect(destination);
}

// Step 1 (secondary): skip resume upload entirely, move straight to step 2
// with blank defaults.
export async function skipResumeUpload() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ resume_prompted: true })
    .eq("id", user!.id);
  if (error) throw new Error(error.message);

  redirect("/onboarding");
}

// Step 2: confirm/edit whatever step 1 produced (or fill in manually if
// skipped), then finish onboarding.
export async function saveProfileDetails(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const targetRole = String(formData.get("target_role") ?? "").trim();
  const targetCompanies = parseList(formData.get("target_companies"));

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      target_role: targetRole,
      target_companies: targetCompanies,
      onboarding_completed: true,
    })
    .eq("id", user!.id);
  if (error) throw new Error(error.message);

  redirect("/interview/new");
}
