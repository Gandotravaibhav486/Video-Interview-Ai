import type { InterviewType, QuestionBankEntry, QuestionType } from "@/lib/supabase/types";

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

// Seniority and job-family filler. A token here can never be the sole reason
// two roles match, which is what stops "Marketing Manager" from pulling the
// entire product_manager set purely because both say "manager". Note
// `associate` is deliberately absent: unlike `manager` and `engineer` it is a
// real standalone tag in this bank (McKinsey-style Associate), so treating it
// as filler would cost associate_consultant half its pool.
const GENERIC_ROLE_TOKENS = new Set([
  "senior",
  "junior",
  "lead",
  "engineer",
  "manager",
  "management",
  "intern",
  "trainee",
  "executive",
  "officer",
  "new",
  "grad",
  "graduate",
  "fresher",
  "i",
  "ii",
  "iii",
]);

// Crude, deliberate stemming. Only the families that actually collide in this
// bank: a student types "Consulting" and the curated tag reads
// "associate_consultant" - neither string contains the other, so plain
// substring matching found nothing and the session silently fell back to the
// whole bank (confirmed live 2026-08-16: a McKinsey consulting interview asked
// about recursion, SQL window functions and Moore vs Mealy machines).
function stemToken(token: string): string {
  if (token.startsWith("consult")) return "consult";
  if (token.startsWith("analy")) return "analy";
  if (token.startsWith("develop")) return "develop";
  if (token.startsWith("market")) return "market";
  return token.replace(/(ing|ed|s)$/, "");
}

function significantTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split("_")
      .filter((t) => t && !GENERIC_ROLE_TOKENS.has(t))
      .map(stemToken)
  );
}

// Token-subset matching, the same shape as companyMatches below and for the
// same reason: raw substring tests are simultaneously too loose (matching
// across word boundaries) and too tight (missing "consulting" vs
// "consultant"). A tag matches when one side's significant tokens are a
// subset of the other's, so "Senior SDE" still reaches `sde` while
// "electrical engineer" correctly reaches nothing.
function roleMatches(tags: string[], role: string): boolean {
  if (tags.length === 0 || !role) return true;
  const roleTokens = significantTokens(role);
  if (roleTokens.size === 0) return false;

  return tags.some((tag) => {
    if (normalize(tag) === normalize(role)) return true;
    const tagTokens = significantTokens(tag);
    if (tagTokens.size === 0) return false;
    return (
      [...tagTokens].every((t) => roleTokens.has(t)) ||
      [...roleTokens].every((t) => tagTokens.has(t))
    );
  });
}

// Companies need the same free-text tolerance ("Texas Instruments" typed into
// the form must reach rows tagged `texas_instruments`, and "Amazon India"
// must still reach `amazon`) but NOT tagMatches' raw substring test, which
// happily matches across word boundaries: `ey` is a substring of `mckinsey`,
// so EY's questions leaked into McKinsey interviews and vice versa (confirmed
// live 2026-08-06). Comparing whole underscore-separated tokens keeps the
// useful fuzziness - a tag matches when one side's tokens are a subset of the
// other's - while making a mid-word collision impossible.
function companyMatches(tags: string[], candidates: string[]): boolean {
  if (tags.length === 0 || candidates.length === 0) return true;
  const candidateTokens = candidates.map((c) => new Set(normalize(c).split("_")));
  return tags.some((tag) => {
    const tagTokens = normalize(tag).split("_");
    return candidateTokens.some(
      (tokens) =>
        tagTokens.every((t) => tokens.has(t)) ||
        [...tokens].every((t) => tagTokens.includes(t))
    );
  });
}

const TYPE_FILTER: Record<InterviewType, QuestionType[] | null> = {
  behavioral: ["behavioral"],
  technical: ["technical"],
  hr_mixed: null, // no type restriction, round-robin across subjects instead
  company_specific: null,
  // Domain-interview and JD-based sessions never call selectSessionQuestions
  // (they source from domain_questions/custom_questions directly), so these
  // entries only exist to satisfy the Record<InterviewType, ...>
  // exhaustiveness check.
  resume_based: null,
  jd_based: null,
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

export interface SelectQuestionsResult {
  questions: QuestionBankEntry[];
  /**
   * True when the role matched no curated question at all. Distinct from
   * "matched, but the other filters emptied it" - the caller shows a
   * different message for each.
   */
  roleUnavailable: boolean;
  /** Role tags that do exist, so the caller can offer real alternatives. */
  availableRoles: string[];
}

/** Distinct role tags present on active questions, alphabetised. */
export function listBankRoles(bank: QuestionBankEntry[]): string[] {
  return Array.from(new Set(bank.flatMap((q) => q.role_tags ?? []))).sort();
}

export function selectSessionQuestions({
  bank,
  role,
  companies,
  interviewType,
  questionCount,
  subjects,
}: SelectQuestionsParams): SelectQuestionsResult {
  const typeFilter = TYPE_FILTER[interviewType];
  const availableRoles = listBankRoles(bank);

  // Role first and on its own, so "this role has no questions" stays
  // distinguishable from "this role has questions, but not of that type".
  const roleEligible = bank.filter((q) => roleMatches(q.role_tags, role));

  if (roleEligible.length === 0) {
    // Previously this fell back to `bank` - the entire library - and
    // round-robined across all 38 subjects, which is how a McKinsey
    // consulting interview came to ask about recursion, SQL window functions
    // and Moore vs Mealy machines (session d36163f2, 2026-08-16). Serving a
    // confidently wrong agenda is worse than serving none: the student can't
    // tell the difference until they're mid-interview.
    return { questions: [], roleUnavailable: true, availableRoles };
  }

  const eligible = roleEligible.filter((q) => {
    if (typeFilter && !typeFilter.includes(q.question_type)) return false;
    if (subjects && subjects.length > 0 && !subjects.includes(q.subject)) {
      return false;
    }
    return true;
  });

  // Narrowing filters may legitimately empty a role that does have coverage
  // (a subject the role has no questions in). Falling back to the role's own
  // pool is safe in a way that falling back to the whole bank never was -
  // every question is still for the right role.
  const pool = eligible.length > 0 ? eligible : roleEligible;

  // Company is a PREFERENCE, applied for every interview type rather than
  // only company_specific.
  //
  // It used to be gated on `interviewType === "company_specific"`, and the
  // manual form hardcodes hr_mixed - so the company a student typed was
  // stored on the session and then ignored during selection. A session
  // recorded with company "Mckinsey" was served "Why Bain specifically,
  // among the other top strategy consulting firms?".
  //
  // A hard filter is not the fix. Every row in this bank carries a company
  // tag (none are company-agnostic), so a strict filter yields 10-32 rows for
  // a typical pairing but zero for others - Consulting @ McKinsey has no
  // company-tagged rows at all - and an empty result would fall back to the
  // whole role pool, discarding the company completely. Taking company
  // matches first and topping up from the role pool degrades smoothly
  // instead: a student always gets their company's questions where they
  // exist, and a full-length interview either way.
  const preferred =
    companies.length > 0
      ? pool.filter((q) => companyMatches(q.company_tags, companies))
      : [];

  const questions = roundRobinBySubject(preferred, questionCount);

  if (questions.length < questionCount) {
    const taken = new Set(questions.map((q) => q.id));
    questions.push(
      ...roundRobinBySubject(
        pool.filter((q) => !taken.has(q.id)),
        questionCount - questions.length
      )
    );
  }

  return { questions, roleUnavailable: false, availableRoles };
}
