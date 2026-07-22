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
  // Domain-interview sessions never call selectSessionQuestions (they
  // source from domain_questions directly), so this entry only exists to
  // satisfy the Record<InterviewType, ...> exhaustiveness check.
  resume_based: null,
};

export interface SelectQuestionsParams {
  bank: QuestionBankEntry[];
  role: string;
  companies: string[];
  interviewType: InterviewType;
  questionCount: number;
  subjects?: string[];
}

// Balances selection across whatever subjects are present in `items`,
// picking round-robin so no single subject dominates a short list. Shared
// by the curated-bank flow here and the custom-JD-question flow, which
// both need "N items, spread across subjects" without needing the
// role/company/type filtering that's specific to the curated bank.
export function roundRobinBySubject<T extends { subject: string }>(
  items: T[],
  count: number
): T[] {
  const bySubject = new Map<string, T[]>();
  for (const item of items) {
    const list = bySubject.get(item.subject) ?? [];
    list.push(item);
    bySubject.set(item.subject, list);
  }
  for (const list of bySubject.values()) {
    list.sort(() => Math.random() - 0.5);
  }

  const eligibleSubjects = Array.from(bySubject.keys()).sort(
    () => Math.random() - 0.5
  );
  const selected: T[] = [];

  let round = 0;
  while (selected.length < count && eligibleSubjects.length > 0) {
    let pickedAny = false;
    for (const subject of eligibleSubjects) {
      if (selected.length >= count) break;
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

export function selectSessionQuestions({
  bank,
  role,
  companies,
  interviewType,
  questionCount,
  subjects,
}: SelectQuestionsParams): QuestionBankEntry[] {
  const roleCandidates = role ? [role] : [];
  const typeFilter = TYPE_FILTER[interviewType];

  const eligible = bank.filter((q) => {
    if (typeFilter && !typeFilter.includes(q.question_type)) return false;
    if (subjects && subjects.length > 0 && !subjects.includes(q.subject)) {
      return false;
    }
    if (interviewType === "company_specific" && companies.length > 0) {
      if (!tagMatches(q.company_tags, companies)) return false;
    }
    return tagMatches(q.role_tags, roleCandidates);
  });

  const pool = eligible.length > 0 ? eligible : bank;

  return roundRobinBySubject(pool, questionCount);
}
