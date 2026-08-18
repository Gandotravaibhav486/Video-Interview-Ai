import { createClient } from "@/lib/supabase/server";
import { startLiveInterviewFromBank } from "@/lib/actions/live-interview";
import { startLiveInterviewFromJD } from "@/lib/actions/job-descriptions";
import { startLiveInterviewFromResume } from "@/lib/actions/domain-interview";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DEFAULT_SUGGESTION_QUESTION_COUNT = 5;
const DEFAULT_BANK_QUESTION_COUNT = 6;
const DEFAULT_JD_QUESTION_COUNT = 6;

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    warning?: string;
    unavailable_role?: string;
    available?: string;
  }>;
}) {
  const { error, warning, unavailable_role, available } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("resume_url, target_role, target_companies, suggested_interviews")
    .eq("id", user!.id)
    .single();

  const suggestions = profile?.suggested_interviews ?? [];
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Start an interview</h1>
        <p className="text-muted-foreground">
          Every interview here is live and conversational - the AI asks
          questions, listens, and follows up in real time.
        </p>
      </div>

      {warning === "resume_parse_failed" && (
        <p className="text-sm text-amber-600">
          We couldn&apos;t generate suggestions from your resume, but you can
          still set up an interview manually below.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {unavailable_role && (
        <RoleUnavailableNotice
          role={unavailable_role}
          availableRoles={(available ?? "").split(",").filter(Boolean)}
        />
      )}

      {hasSuggestions && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">Suggested for you</h2>
            <p className="text-muted-foreground">
              Based on your resume — pick one to start right away.
            </p>
          </div>
          {suggestions.map((s, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  {s.role}
                  {s.company ? ` — ${s.company}` : ""}
                </CardTitle>
                <CardDescription>{s.rationale}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {s.subjects.map((subject) => (
                    <Badge key={subject} variant="secondary">
                      {subject}
                    </Badge>
                  ))}
                </div>
                <form action={startLiveInterviewFromBank}>
                  <input type="hidden" name="role" value={s.role} />
                  <input type="hidden" name="company" value={s.company ?? ""} />
                  <input
                    type="hidden"
                    name="interview_type"
                    value={s.interview_type}
                  />
                  <input
                    type="hidden"
                    name="question_count"
                    value={DEFAULT_SUGGESTION_QUESTION_COUNT}
                  />
                  <input
                    type="hidden"
                    name="subjects"
                    value={s.subjects.join(", ")}
                  />
                  <SubmitButton pendingText="Starting…">
                    Start this interview
                  </SubmitButton>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold">
          {hasSuggestions ? "Or start manually" : "Choose how to start"}
        </h2>
        <p className="text-muted-foreground">
          Three ways to get a question set - pick whichever fits.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Choose a role
            </CardTitle>
            <CardDescription>
              We&apos;ll auto-select a balanced mix of questions matching
              your role from the curated bank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={startLiveInterviewFromBank}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  name="role"
                  defaultValue={profile?.target_role ?? ""}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company">Company (optional)</Label>
                <Input
                  id="company"
                  name="company"
                  placeholder="tcs, infosys, amazon..."
                  defaultValue={profile?.target_companies?.[0] ?? ""}
                />
              </div>
              <input
                type="hidden"
                name="target_companies"
                value={profile?.target_companies?.join(", ") ?? ""}
              />
              {/* No interview_type selector here - always hr_mixed for the
                  manual path, matching how the live flow already behaved
                  before suggestion cards existed. Suggestion cards above
                  still carry their own varied interview_type. */}
              <input type="hidden" name="interview_type" value="hr_mixed" />
              <div className="flex flex-col gap-2">
                <Label htmlFor="question_count">Number of questions</Label>
                <Input
                  id="question_count"
                  name="question_count"
                  type="number"
                  min={3}
                  max={10}
                  defaultValue={DEFAULT_BANK_QUESTION_COUNT}
                />
              </div>
              <SubmitButton pendingText="Starting…" className="mt-2">
                Start interview
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Paste a job description
            </CardTitle>
            <CardDescription>
              We&apos;ll generate questions tailored to this specific
              posting and start right away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={startLiveInterviewFromJD}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="jd_text">Job description</Label>
                <Textarea
                  id="jd_text"
                  name="jd_text"
                  rows={8}
                  placeholder="Paste the full job posting here..."
                  required
                />
              </div>
              <input
                type="hidden"
                name="question_count"
                value={DEFAULT_JD_QUESTION_COUNT}
              />
              <SubmitButton pendingText="Generating questions…" className="mt-2">
                Generate &amp; start
              </SubmitButton>
              <p className="text-xs text-muted-foreground">
                Takes 15–30 seconds - analyzing the posting and writing
                questions for it before the interview begins.
              </p>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Use my resume
            </CardTitle>
            <CardDescription>
              Questions grounded in your actual projects and experience -
              no typing needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profile?.resume_url ? (
              <form action={startLiveInterviewFromResume} className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Role:{" "}
                  <span className="font-medium text-foreground">
                    {profile?.target_role || "Not set - update it in your profile"}
                  </span>
                </p>
                <SubmitButton pendingText="Preparing…">
                  Start interview
                </SubmitButton>
                <p className="text-xs text-muted-foreground">
                  First time only: takes 15–30 seconds to generate questions
                  from your resume. Instant after that.
                </p>
              </form>
            ) : (
              <Link
                href="/resume/upload?redirect_to=%2Finterview%2Fnew"
                className={buttonVariants({ variant: "secondary" })}
              >
                Upload resume to unlock
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function humanizeRole(tag: string): string {
  return tag
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Shown when a student asked for a role the curated bank does not cover.
 *
 * This replaces silently substituting a random cross-subject agenda, which is
 * how a McKinsey consulting interview ended up asking about recursion and
 * Moore vs Mealy machines. Saying "we don't have this yet" costs a session;
 * quietly asking the wrong questions costs the student's trust in every score
 * the product has ever given them.
 *
 * The two offers are ordered by how well they actually answer the request:
 * the job-description path produces genuinely role-specific questions, so it
 * comes first and is the primary action. The curated roles are the
 * consolation, not the headline.
 */
function RoleUnavailableNotice({
  role,
  availableRoles,
}: {
  role: string;
  availableRoles: string[];
}) {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-5">
      <h2 className="text-display-sm">
        We don&apos;t have a question set for &ldquo;{role}&rdquo; yet.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Rather than hand you questions written for a different role, here are
        two ways to get an interview that actually fits.
      </p>

      <p className="mt-5 text-sm">
        <span className="font-medium">Paste the job description</span> — we
        generate questions from that specific posting, which is the closest fit
        for a role we don&apos;t curate yet. Use the card below.
      </p>

      {availableRoles.length > 0 && (
        <>
          <p className="mt-4 text-sm font-medium">
            Or start one of the roles we do cover:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableRoles.map((r) => (
              <form key={r} action={startLiveInterviewFromBank}>
                <input type="hidden" name="role" value={r} />
                <input type="hidden" name="interview_type" value="hr_mixed" />
                <input
                  type="hidden"
                  name="question_count"
                  value={DEFAULT_BANK_QUESTION_COUNT}
                />
                <SubmitButton
                  variant="outline"
                  size="pill-sm"
                  pendingText="Starting…"
                >
                  {humanizeRole(r)}
                </SubmitButton>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
