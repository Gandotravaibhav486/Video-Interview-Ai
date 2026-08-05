"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeJobDescription,
  generateCustomQuestions,
  type JobDescriptionAnalysis,
  type GeneratedCustomQuestion,
} from "@/lib/ai/job-description";
import { roundRobinBySubject } from "@/lib/questions/select";
import { launchLiveSession } from "@/lib/actions/live-interview";

const QUESTIONS_PER_SUBJECT = 3;
const DEFAULT_SESSION_QUESTION_COUNT = 6;

// One submit does analyze -> generate -> persist -> launch, replacing the old
// two-step "generate questions, then separately click start on a listed JD"
// flow now that there's no standalone /jd page to list past submissions on.
// The job_descriptions/custom_questions insert is kept (not made ephemeral)
// for provenance even without a page to browse it.
export async function startLiveInterviewFromJD(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jdText = String(formData.get("jd_text") ?? "").trim();
  if (!jdText) {
    redirect(`/interview/new?error=${encodeURIComponent("Please paste a job description")}`);
  }

  let analysis: JobDescriptionAnalysis | null = null;
  let questions: GeneratedCustomQuestion[] | null = null;
  let errorMessage: string | null = null;
  try {
    analysis = await analyzeJobDescription(jdText);
    questions = await generateCustomQuestions(analysis, QUESTIONS_PER_SUBJECT);
  } catch (err) {
    console.error("Job description generation failed:", err);
    errorMessage =
      err instanceof Error
        ? err.message
        : "Failed to generate questions from that job description";
  }

  // redirect() throws internally, so it must never be called from inside a
  // catch block (it can misbehave there) - flag the error and redirect
  // after the try/catch has fully exited instead, same pattern as
  // onboarding.ts's uploadResume.
  if (errorMessage || !analysis || !questions) {
    redirect(`/interview/new?error=${encodeURIComponent(errorMessage ?? "Something went wrong")}`);
  }

  const { data: jd, error: jdError } = await supabase
    .from("job_descriptions")
    .insert({
      user_id: user!.id,
      raw_text: jdText,
      role: analysis.role,
      company: analysis.company,
      seniority: analysis.seniority,
      required_skills: analysis.required_skills,
      subjects: analysis.subjects,
      status: "ready",
    })
    .select("id")
    .single();

  if (jdError || !jd) {
    throw new Error(jdError?.message ?? "Failed to save job description");
  }

  const { data: insertedQuestions, error: questionsError } = await supabase
    .from("custom_questions")
    .insert(
      questions.map((q) => ({
        job_description_id: jd.id,
        subject: q.subject,
        question_text: q.question_text,
        reference_answer: q.reference_answer,
        question_type: q.question_type,
        difficulty: q.difficulty,
      }))
    )
    .select("*");

  if (questionsError || !insertedQuestions) {
    await supabase
      .from("job_descriptions")
      .update({ status: "failed" })
      .eq("id", jd.id);
    throw new Error(questionsError?.message ?? "Failed to save generated questions");
  }

  const selected = roundRobinBySubject(insertedQuestions, DEFAULT_SESSION_QUESTION_COUNT);

  await launchLiveSession({
    supabase,
    userId: user!.id,
    role: analysis.role,
    company: analysis.company,
    interviewType: "hr_mixed",
    questions: selected.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      custom_question_id: q.id,
    })),
  });
}
