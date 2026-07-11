import type { InterviewType, QuestionBankEntry, QuestionType } from "@/lib/supabase/types";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function tagMatches(tags: string[], candidates: string[]): boolean {
  if (tags.length === 0 || candidates.length === 0) return true;
  const normalizedCandidates = candidates.map(normalize);
  return tags.some((tag) =>
    normalizedCandidates.some(
      (candidate) => candidate.includes(tag) || tag.includes(candidate)
    )
  );
}

const TYPE_FILTER: Record<InterviewType, QuestionType[] | null> = {
  behavioral: ["behavioral"],
  technical: ["technical"],
  hr_mixed: null, // no type restriction, round-robin across subjects instead
  company_specific: null,
};

export interface SelectQuestionsParams {
  bank: QuestionBankEntry[];
  role: string;
  companies: string[];
  interviewType: InterviewType;
  questionCount: number;
}

export function selectSessionQuestions({
  bank,
  role,
  companies,
  interviewType,
  questionCount,
}: SelectQuestionsParams): QuestionBankEntry[] {
  const roleCandidates = role ? [role] : [];
  const typeFilter = TYPE_FILTER[interviewType];

  const eligible = bank.filter((q) => {
    if (typeFilter && !typeFilter.includes(q.question_type)) return false;
    if (interviewType === "company_specific" && companies.length > 0) {
      if (!tagMatches(q.company_tags, companies)) return false;
    }
    return tagMatches(q.role_tags, roleCandidates);
  });

  const pool = eligible.length > 0 ? eligible : bank;

  const bySubject = new Map<string, QuestionBankEntry[]>();
  for (const q of pool) {
    const list = bySubject.get(q.subject) ?? [];
    list.push(q);
    bySubject.set(q.subject, list);
  }
  for (const list of bySubject.values()) {
    list.sort(() => Math.random() - 0.5);
  }

  const subjects = Array.from(bySubject.keys()).sort(() => Math.random() - 0.5);
  const selected: QuestionBankEntry[] = [];

  let round = 0;
  while (selected.length < questionCount && subjects.length > 0) {
    let pickedAny = false;
    for (const subject of subjects) {
      if (selected.length >= questionCount) break;
      const list = bySubject.get(subject)!;
      if (round < list.length) {
        selected.push(list[round]);
        pickedAny = true;
      }
    }
    if (!pickedAny) break;
    round += 1;
  }

  return selected;
}
