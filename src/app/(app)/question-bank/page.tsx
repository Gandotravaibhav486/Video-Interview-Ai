import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuestionBankManager } from "@/components/question-bank/question-bank-manager";
import {
  generateQuestionsForRoleCompany,
  exportQuestionBankToCsv,
} from "@/lib/actions/question-bank-generation";
import { KNOWN_ROLES, KNOWN_COMPANIES } from "@/lib/ai/resume";
import { BatchGenerationRunner } from "@/components/question-bank/batch-generation-runner";
import { pairingsByPriority } from "@/lib/questions/placement-matrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// One pairing is three sequential AI calls (web-search research, generate,
// verify) and can take several minutes, so the server actions on this page
// need far more headroom than the default. 300 is the actual hard ceiling
// Vercel enforces at build time for the Hobby plan this project is on - a
// higher value doesn't just get silently clamped, it fails the production
// build outright (confirmed live 2026-08-05: this broke every deploy since
// the value was first set to 800, well before that was noticed). A pairing
// that genuinely needs longer than 300s will still time out; that's a real
// limitation of this plan, not something to work around by raising this
// number again. Generation is realistically a local admin tool anyway,
// which also matches the CSV export, whose writes are lost on a serverless
// filesystem.
export const maxDuration = 300;

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    generated?: string;
    rejected?: string;
    exported?: string;
  }>;
}) {
  const { error, generated, rejected, exported } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/dashboard");
  }

  const { data: questions } = await supabase
    .from("question_bank")
    .select("*")
    .order("subject", { ascending: true })
    .order("created_at", { ascending: false });

  const tier1 = pairingsByPriority(1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Question bank</h1>
        <p className="text-muted-foreground">
          Manage the curated questions and reference answers students draw
          from when starting a mock interview.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {generated && (
        <p className="text-sm text-green-700">
          Added {generated} verified question{generated === "1" ? "" : "s"} to the
          bank ({rejected ?? 0} rejected by verification).
        </p>
      )}
      {exported && (
        <p className="text-sm text-green-700">
          Exported {exported} rows to question-bank-export/questions.csv
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Generate questions</CardTitle>
          <CardDescription>
            Researches how the company actually interviews for this role, drafts
            questions from those findings, then runs a separate verification
            pass — only questions that survive it are added. One pairing per
            run; expect it to take a minute or two.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            action={generateQuestionsForRoleCompany}
            className="flex flex-wrap items-end gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-role">Role</Label>
              <Input
                id="gen-role"
                name="role"
                list="known-roles"
                placeholder="business_analyst"
                required
                className="w-56"
              />
              <datalist id="known-roles">
                {KNOWN_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-company">Company (optional)</Label>
              <Input
                id="gen-company"
                name="company"
                list="known-companies"
                placeholder="tcs"
                className="w-56"
              />
              <datalist id="known-companies">
                {KNOWN_COMPANIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-count">Count</Label>
              <Input
                id="gen-count"
                name="count"
                type="number"
                min={1}
                max={20}
                defaultValue={10}
                className="w-24"
              />
            </div>
            <Button type="submit">Generate</Button>
          </form>

          <form action={exportQuestionBankToCsv}>
            <Button type="submit" variant="outline" size="sm">
              Export whole bank to CSV
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch: tier-1 placement pairings</CardTitle>
          <CardDescription>
            Walks the highest-volume campus pairings in sequence, one at a time.
            Pairings that already have generated questions are skipped, so a
            stopped or interrupted run can be restarted safely. Keep this tab
            open — the sequence is driven from the browser, and closing it stops
            the run after the current pairing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BatchGenerationRunner pairings={tier1} />
        </CardContent>
      </Card>

      <QuestionBankManager questions={questions ?? []} />
    </div>
  );
}
