"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeResumeForDomainInterview,
  generateDomainQuestions,
  type DomainResumeAnalysis,
  type GeneratedDomainQuestion,
} from "@/lib/ai/domain-interview";
import { roundRobinBySubject } from "@/lib/questions/select";
import { persistInterviewSession } from "@/lib/sessions/persist-session";

const QUESTIONS_PER_SUBJECT = 3;
const SESSION_QUESTION_COUNT = 6;

export async function startDomainInterview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("resume_url, target_role")
    .eq("id", user!.id)
    .single();

  if (!profile?.resume_url) {
    redirect("/resume/upload?redirect_to=" + encodeURIComponent("/dashboard"));
  }

  const { data: existing } = await supabase
    .from("domain_questions")
    .select("*")
    .eq("user_id", user!.id);

  let domainQuestions = existing ?? [];

  if (domainQuestions.length === 0) {
    let analysis: DomainResumeAnalysis | null = null;
    let questions: GeneratedDomainQuestion[] | null = null;
    let errorMessage: string | null = null;

    try {
      const { data: pdfBlob, error: downloadError } = await supabase.storage
        .from("resumes")
        .download(profile!.resume_url!);
      if (downloadError || !pdfBlob) {
        throw new Error(downloadError?.message ?? "Could not read your resume file");
      }

      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: await pdfBlob.arrayBuffer() });
      const parsed = await parser.getText();

      analysis = await analyzeResumeForDomainInterview(parsed.text);
      questions = await generateDomainQuestions(analysis, QUESTIONS_PER_SUBJECT);
    } catch (err) {
      console.error("Domain interview generation failed:", err);
      errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to generate questions from your resume";
    }

    // redirect() must never be called from inside a catch block - flag the
    // error and redirect only after the try/catch has fully exited.
    if (errorMessage || !analysis || !questions) {
      redirect(
        `/dashboard?error=${encodeURIComponent(errorMessage ?? "Something went wrong")}`
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("domain_questions")
      .insert(
        questions.map((q) => ({
          user_id: user!.id,
          subject: q.subject,
          question_text: q.question_text,
          reference_answer: q.reference_answer,
          question_type: q.question_type,
          difficulty: q.difficulty,
        }))
      )
      .select("*");

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Failed to save domain questions");
    }

    domainQuestions = inserted;
  }

  const selected = roundRobinBySubject(domainQuestions, SESSION_QUESTION_COUNT);

  const sessionId = await persistInterviewSession(supabase, {
    userId: user!.id,
    role: profile!.target_role || "Domain Interview",
    company: null,
    interviewType: "resume_based",
    questions: selected.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      domain_question_id: q.id,
    })),
  });

  redirect(`/interview/${sessionId}/record`);
}
