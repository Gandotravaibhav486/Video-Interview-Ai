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
import { persistInterviewSession } from "@/lib/sessions/persist-session";

const QUESTIONS_PER_SUBJECT = 3;
const DEFAULT_SESSION_QUESTION_COUNT = 6;

export async function submitJobDescription(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jdText = String(formData.get("jd_text") ?? "").trim();
  if (!jdText) {
    redirect(`/jd?error=${encodeURIComponent("Please paste a job description")}`);
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
    redirect(`/jd?error=${encodeURIComponent(errorMessage ?? "Something went wrong")}`);
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

  const { error: questionsError } = await supabase.from("custom_questions").insert(
    questions.map((q) => ({
      job_description_id: jd.id,
      subject: q.subject,
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      question_type: q.question_type,
      difficulty: q.difficulty,
    }))
  );

  if (questionsError) {
    await supabase
      .from("job_descriptions")
      .update({ status: "failed" })
      .eq("id", jd.id);
    throw new Error(questionsError.message);
  }

  redirect("/jd");
}

export async function startInterviewFromJobDescription(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobDescriptionId = String(formData.get("job_description_id") ?? "");
  const questionCount = Number(
    formData.get("question_count") ?? DEFAULT_SESSION_QUESTION_COUNT
  );

  const { data: jd } = await supabase
    .from("job_descriptions")
    .select("*")
    .eq("id", jobDescriptionId)
    .single();

  if (!jd) {
    redirect(`/jd?error=${encodeURIComponent("Job description not found")}`);
  }

  const { data: customQuestions } = await supabase
    .from("custom_questions")
    .select("*")
    .eq("job_description_id", jobDescriptionId);

  if (!customQuestions || customQuestions.length === 0) {
    redirect(
      `/jd?error=${encodeURIComponent("No questions were generated for this job description")}`
    );
  }

  const selected = roundRobinBySubject(customQuestions!, questionCount);

  const sessionId = await persistInterviewSession(supabase, {
    userId: user!.id,
    role: jd!.role,
    company: jd!.company,
    interviewType: "hr_mixed",
    questions: selected.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      custom_question_id: q.id,
    })),
  });

  redirect(`/interview/${sessionId}/record`);
}
