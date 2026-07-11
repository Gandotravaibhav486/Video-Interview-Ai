"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Difficulty, QuestionType } from "@/lib/supabase/types";

function parseTags(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export async function upsertQuestionBankEntry(formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id");
  const payload = {
    subject: String(formData.get("subject") ?? "").trim(),
    role_tags: parseTags(formData.get("role_tags")),
    company_tags: parseTags(formData.get("company_tags")),
    question_text: String(formData.get("question_text") ?? "").trim(),
    reference_answer: String(formData.get("reference_answer") ?? "").trim(),
    difficulty: String(formData.get("difficulty") ?? "medium") as Difficulty,
    question_type: String(
      formData.get("question_type") ?? "technical"
    ) as QuestionType,
  };

  if (id) {
    const { error } = await supabase
      .from("question_bank")
      .update(payload)
      .eq("id", String(id));
    if (error) throw new Error(error.message);
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("question_bank")
      .insert({ ...payload, created_by: user?.id ?? null });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/question-bank");
}

export async function setQuestionBankEntryActive(
  id: string,
  isActive: boolean
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("question_bank")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/question-bank");
}

export async function deleteQuestionBankEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("question_bank").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/question-bank");
}
