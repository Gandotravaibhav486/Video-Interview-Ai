"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { analyzeResume } from "@/lib/ai/resume";
import type { Database, ExperienceLevel, Profile } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Stores a resume PDF and returns whatever analysis could be extracted from
 * it, as a partial profile update.
 *
 * Shared by `uploadResume` (the standalone /resume/upload route) and
 * `completeOnboarding` (the guided flow) so the storage path, the
 * domain_questions invalidation, and the parse/analyse behaviour can never
 * drift apart between the two entry points.
 *
 * Analysis is best-effort by design: a student must never be trapped on a
 * broken PDF, so a failure returns `parseFailed` and the caller carries on
 * with whatever it already had.
 */
async function storeAndAnalyzeResume(
  supabase: SupabaseClient<Database>,
  userId: string,
  resumeFile: File
): Promise<{ update: Partial<Profile>; parseFailed: boolean }> {
  const path = `${userId}/resume.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(path, resumeFile, {
      upsert: true,
      contentType: "application/pdf",
    });
  if (uploadError) throw new Error(uploadError.message);

  // A new resume invalidates any previously generated Domain Interview
  // question set unconditionally (not gated on the analysis below
  // succeeding) - domain_questions must never silently correspond to a
  // resume the student has since replaced.
  await supabase.from("domain_questions").delete().eq("user_id", userId);

  const update: Partial<Profile> = { resume_url: path, resume_prompted: true };

  try {
    const { CanvasFactory } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({
      data: await resumeFile.arrayBuffer(),
      CanvasFactory,
    });
    const parsed = await parser.getText();
    const analysis = await analyzeResume(parsed.text);

    update.resume_parsed_summary = analysis.summary;
    update.resume_skills = analysis.skills;
    update.suggested_interviews = analysis.suggested_interviews;
    update.full_name = analysis.profile_defaults.full_name ?? undefined;
    update.target_role = analysis.profile_defaults.target_role;
    update.target_companies = analysis.profile_defaults.target_companies;
  } catch (err) {
    console.error("Resume analysis failed:", err);
    return { update, parseFailed: true };
  }

  return { update, parseFailed: false };
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

  const { update, parseFailed } = await storeAndAnalyzeResume(
    supabase,
    user!.id,
    resumeFile!
  );

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

/**
 * Single submit for the guided onboarding flow.
 *
 * The flow collects every answer client-side and posts once at the end, so
 * this writes the whole profile - including both gate flags - in one
 * statement. That is deliberate: a partial write would leave a student
 * half-onboarded with no screen able to resume them, which is exactly the
 * state the old two-action flow could strand people in.
 *
 * Answers the student typed always beat anything inferred from their resume.
 * They entered the role and companies two screens before uploading, so
 * letting the analysis overwrite them would silently discard a deliberate
 * choice; the analysis is still used for the fields only it can produce.
 */
export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const targetRole = String(formData.get("target_role") ?? "").trim();
  const targetCompanies = parseList(formData.get("target_companies"));
  const experienceLevel = (
    String(formData.get("experience_level") ?? "") === "experienced"
      ? "experienced"
      : "campus_fresher"
  ) satisfies ExperienceLevel;

  const resumeFile = formData.get("resume") as File | null;
  const hasResume = Boolean(resumeFile && resumeFile.size > 0);

  let update: Partial<Profile> = {};
  let parseFailed = false;

  if (hasResume) {
    const result = await storeAndAnalyzeResume(supabase, user!.id, resumeFile!);
    update = result.update;
    parseFailed = result.parseFailed;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      ...update,
      full_name: fullName,
      target_role: targetRole,
      target_companies: targetCompanies,
      experience_level: experienceLevel,
      resume_prompted: true,
      onboarding_completed: true,
    })
    .eq("id", user!.id);
  if (error) throw new Error(error.message);

  // Outside any try/catch on purpose: redirect() signals by throwing, and
  // calling it from a catch block swallows the navigation.
  redirect(
    parseFailed ? "/interview/new?warning=resume_parse_failed" : "/interview/new"
  );
}
