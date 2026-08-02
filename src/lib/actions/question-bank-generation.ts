"use server";

import { appendFile, mkdir, access } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  researchRoleCompanyPatterns,
  generateBankQuestions,
  verifyBankQuestions,
  addUsage,
  EMPTY_USAGE,
  type RoleCompanyResearch,
  type GeneratedBankQuestion,
  type QuestionVerdict,
  type TokenUsage,
} from "@/lib/ai/question-bank-generation";

const EXPORT_DIR = path.join(process.cwd(), "question-bank-export");
const EXPORT_FILE = path.join(EXPORT_DIR, "questions.csv");

const CSV_HEADER = [
  "role",
  "company",
  "subject",
  "skills",
  "question_type",
  "difficulty",
  "question_text",
  "reference_answer",
  "verification_verdict",
  "grounding_notes",
  "generated_at",
];

// Reference answers and grounding notes are long free text containing commas,
// quotes, and newlines - joining with "," would silently corrupt the file, so
// every field goes through proper quoting.
function csvField(value: string | null): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

function csvRow(values: (string | null)[]): string {
  return values.map(csvField).join(",") + "\n";
}

interface ExportRow {
  role: string;
  company: string | null;
  subject: string;
  skills: string;
  question_type: string;
  difficulty: string;
  question_text: string;
  reference_answer: string;
  verification_verdict: string | null;
  grounding_notes: string | null;
}

/**
 * Appends to a local CSV for the operator's own review. Development-only by
 * nature: on Vercel the filesystem is ephemeral, so this is a convenience for
 * local runs rather than a production artifact. A failed write never fails the
 * run - the database insert is the real outcome.
 */
async function appendToCsvExport(rows: ExportRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await mkdir(EXPORT_DIR, { recursive: true });

    let needsHeader = false;
    try {
      await access(EXPORT_FILE);
    } catch {
      needsHeader = true;
    }

    const generatedAt = new Date().toISOString();
    const body = rows
      .map((r) =>
        csvRow([
          r.role,
          r.company,
          r.subject,
          r.skills,
          r.question_type,
          r.difficulty,
          r.question_text,
          r.reference_answer,
          r.verification_verdict,
          r.grounding_notes,
          generatedAt,
        ])
      )
      .join("");

    await appendFile(
      EXPORT_FILE,
      (needsHeader ? csvRow(CSV_HEADER) : "") + body,
      "utf8"
    );
  } catch (err) {
    console.error("CSV export failed (generation itself succeeded):", err);
  }
}

export interface PairingResult {
  role: string;
  company: string | null;
  status: "generated" | "skipped" | "failed";
  added: number;
  rejected: number;
  message: string;
  /** What this pairing cost, including passes that ran before a failure. */
  usage: TokenUsage;
}

/**
 * Generates one role+company pairing and returns a result rather than
 * redirecting - this is the shape the batch runner needs, since it drives many
 * pairings in sequence and must keep going past a failure.
 *
 * A full batch is far too long for one request (~7 minutes per pairing), so
 * the client calls this once per pairing rather than the server looping.
 */
export async function generateForPairing({
  role,
  company,
  count = 10,
  skipIfExists = true,
}: {
  role: string;
  company: string | null;
  count?: number;
  skipIfExists?: boolean;
}): Promise<PairingResult> {
  const base = { role, company, added: 0, rejected: 0, usage: EMPTY_USAGE };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ...base, status: "failed", message: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return { ...base, status: "failed", message: "Admin only" };
  }

  if (!role) {
    return { ...base, status: "failed", message: "Role is required" };
  }

  // Resumability: a batch interrupted halfway (closed tab, network drop)
  // must not re-generate and duplicate what already landed.
  if (skipIfExists) {
    // Note the company branch: `contains(company_tags, [])` would match every
    // row, since an empty array is a subset of anything - so a company-less
    // pairing would wrongly skip because some *other* company's rows exist.
    // A company-less pairing must match only rows that are themselves
    // company-less.
    let query = supabase
      .from("question_bank")
      .select("id")
      .eq("source", "ai_generated")
      .contains("role_tags", [role]);
    // `.filter()` rather than `.eq()` for the company-less case: the correct
    // PostgREST value for "empty array" is the literal {}, which .eq()'s
    // typing rejects (it expects string[], and serializing [] yields an empty
    // string rather than {}).
    query = company
      ? query.contains("company_tags", [company])
      : query.filter("company_tags", "eq", "{}");

    const existing = await query.limit(1);
    if (existing.data && existing.data.length > 0) {
      return {
        ...base,
        status: "skipped",
        message: "Already generated for this pairing",
      };
    }
  }

  let research: RoleCompanyResearch;
  let questions: GeneratedBankQuestion[];
  let verdicts: QuestionVerdict[];
  // Accumulated outside the try so a failure still reports what was already
  // spent - a pairing that dies in verification has already paid for research.
  let usage = EMPTY_USAGE;
  try {
    research = await researchRoleCompanyPatterns(role, company);
    usage = addUsage(usage, research.usage);

    const generated = await generateBankQuestions(role, company, research, count);
    questions = generated.questions;
    usage = addUsage(usage, generated.usage);

    const verified = await verifyBankQuestions(role, company, research, questions);
    verdicts = verified.verdicts;
    usage = addUsage(usage, verified.usage);
  } catch (err) {
    console.error(`Generation failed for ${role}/${company ?? "any"}:`, err);
    return {
      ...base,
      usage,
      status: "failed",
      message: err instanceof Error ? err.message : "Generation failed",
    };
  }

  const survivors = questions
    .map((q, i) => ({ question: q, verdict: verdicts[i] }))
    .filter((x) => x.verdict.verdict !== "rejected");
  const rejectedCount = verdicts.length - survivors.length;

  for (const v of verdicts.filter((v) => v.verdict === "rejected")) {
    console.log(
      `Rejected [${role}/${company ?? "any"}] "${questions[v.index]?.question_text?.slice(0, 80)}": ${v.reason}`
    );
  }

  if (survivors.length === 0) {
    return {
      ...base,
      usage,
      status: "failed",
      rejected: rejectedCount,
      message: `All ${questions.length} questions rejected by verification`,
    };
  }

  const verifiedAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("question_bank").insert(
    survivors.map(({ question, verdict }) => ({
      subject: question.subject,
      skills: question.skills,
      role_tags: [role],
      company_tags: company ? [company] : [],
      question_text: question.question_text,
      reference_answer: question.reference_answer,
      question_type: question.question_type,
      difficulty: question.difficulty,
      source: "ai_generated" as const,
      grounding_notes: research.notes,
      verification_verdict: verdict.verdict,
      verified_at: verifiedAt,
      created_by: user.id,
    }))
  );

  if (insertError) {
    return {
      ...base,
      usage,
      status: "failed",
      rejected: rejectedCount,
      message: `DB insert failed: ${insertError.message}`,
    };
  }

  await appendToCsvExport(
    survivors.map(({ question, verdict }) => ({
      role,
      company,
      subject: question.subject,
      skills: question.skills.join(" "),
      question_type: question.question_type,
      difficulty: question.difficulty,
      question_text: question.question_text,
      reference_answer: question.reference_answer,
      verification_verdict: verdict.verdict,
      grounding_notes: research.notes,
    }))
  );

  revalidatePath("/question-bank");
  console.log(
    `[${role}@${company ?? "any"}] ${survivors.length} added, ${rejectedCount} rejected | ` +
      `${usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens} in / ` +
      `${usage.outputTokens} out | $${usage.costUsd.toFixed(3)}`
  );
  return {
    ...base,
    usage,
    status: "generated",
    added: survivors.length,
    rejected: rejectedCount,
    message: `${survivors.length} added, ${rejectedCount} rejected · $${usage.costUsd.toFixed(2)}`,
  };
}

/** Form-action wrapper around generateForPairing for the single-pairing form. */
export async function generateQuestionsForRoleCompany(formData: FormData) {
  const role = String(formData.get("role") ?? "").trim().toLowerCase();
  const company =
    String(formData.get("company") ?? "").trim().toLowerCase() || null;
  const count = Number(formData.get("count") ?? 10);

  // The manual form is how you deliberately top up a pairing that already has
  // questions, so it must not silently skip.
  const result = await generateForPairing({
    role,
    company,
    count,
    skipIfExists: false,
  });

  // redirect() throws internally and must never be called from inside a
  // try/catch around the generation - generateForPairing returns rather than
  // throwing, so this is safely outside it.
  if (result.status !== "generated") {
    redirect(`/question-bank?error=${encodeURIComponent(result.message)}`);
  }
  redirect(
    `/question-bank?generated=${result.added}&rejected=${result.rejected}`
  );
}

/**
 * Dumps the entire current bank (including the hand-written rows that predate
 * the generator) to the same review file, so the operator's CSV reflects the
 * whole bank rather than only newly-generated additions.
 */
export async function exportQuestionBankToCsv() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("question_bank")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  await appendToCsvExport(
    (rows ?? []).map((r) => ({
      role: r.role_tags.join(" "),
      company: r.company_tags.join(" ") || null,
      subject: r.subject,
      skills: r.skills.join(" "),
      question_type: r.question_type,
      difficulty: r.difficulty,
      question_text: r.question_text,
      reference_answer: r.reference_answer,
      verification_verdict: r.verification_verdict,
      grounding_notes: r.grounding_notes,
    }))
  );

  redirect(`/question-bank?exported=${rows?.length ?? 0}`);
}
