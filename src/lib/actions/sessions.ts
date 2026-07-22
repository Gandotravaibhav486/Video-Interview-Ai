"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectSessionQuestions } from "@/lib/questions/select";
import { persistInterviewSession } from "@/lib/sessions/persist-session";
import type { InterviewType } from "@/lib/supabase/types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function createInterviewSession(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = String(formData.get("role") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim() || null;
  const interviewType = String(
    formData.get("interview_type") ?? "hr_mixed"
  ) as InterviewType;
  const questionCount = Number(formData.get("question_count") ?? 5);

  const subjects = parseList(formData.get("subjects"));

  const { data: bank } = await supabase
    .from("question_bank")
    .select("*")
    .eq("is_active", true);

  const selected = selectSessionQuestions({
    bank: bank ?? [],
    role,
    companies: company ? [company] : parseList(formData.get("target_companies")),
    interviewType,
    questionCount,
    subjects: subjects.length > 0 ? subjects : undefined,
  });

  if (selected.length === 0) {
    redirect(
      `/interview/new?error=${encodeURIComponent(
        "No questions available in the bank yet for this role. Ask an admin to add some."
      )}`
    );
  }

  const sessionId = await persistInterviewSession(supabase, {
    userId: user!.id,
    role,
    company,
    interviewType,
    questions: selected.map((q) => ({
      question_text: q.question_text,
      reference_answer: q.reference_answer,
      subject: q.subject,
      question_type: q.question_type,
      question_bank_id: q.id,
    })),
  });

  redirect(`/interview/${sessionId}/record`);
}
