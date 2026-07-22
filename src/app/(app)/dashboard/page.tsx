import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startDomainInterview } from "@/lib/actions/domain-interview";
import { ScoreTrendChart } from "@/components/dashboard/dashboard-trends";
import { SubjectBreakdownChart } from "@/components/interview/results-charts";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("resume_url")
    .eq("id", user!.id)
    .single();

  const { data: allSessions } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const sessions = allSessions ?? [];
  const completed = sessions
    .filter((s) => s.status === "completed")
    .sort(
      (a, b) =>
        new Date(a.completed_at ?? 0).getTime() -
        new Date(b.completed_at ?? 0).getTime()
    );

  const subjectTotals: Record<string, { sum: number; count: number }> = {};
  for (const s of completed) {
    for (const [subject, score] of Object.entries(s.subject_breakdown)) {
      const t = subjectTotals[subject] ?? { sum: 0, count: 0 };
      t.sum += score;
      t.count += 1;
      subjectTotals[subject] = t;
    }
  }
  const aggregateSubjectBreakdown = Object.fromEntries(
    Object.entries(subjectTotals).map(([subject, t]) => [
      subject,
      Math.round(t.sum / t.count),
    ])
  );
  const weakestSubject = Object.entries(aggregateSubjectBreakdown).sort(
    (a, b) => a[1] - b[1]
  )[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your progress</h1>
        <div className="flex items-center gap-3">
          {profile?.resume_url ? (
            <form action={startDomainInterview}>
              <Button type="submit" variant="secondary">
                Domain Interview
              </Button>
            </form>
          ) : (
            <Link
              href="/resume/upload"
              className={buttonVariants({ variant: "secondary" })}
            >
              Upload resume to unlock Domain Interview
            </Link>
          )}
          <Link href="/interview/new" className={buttonVariants()}>
            Start new interview
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {completed.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No completed interviews yet</CardTitle>
            <CardDescription>
              Start your first mock interview to see your score trends here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {weakestSubject && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm">
                  Your weakest area recently is{" "}
                  <Badge variant="secondary">{weakestSubject[0]}</Badge> with an
                  average score of {weakestSubject[1]}/100. Consider practicing
                  more questions in that subject.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Score trend over time</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreTrendChart sessions={completed} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Average score by subject</CardTitle>
              </CardHeader>
              <CardContent>
                <SubjectBreakdownChart
                  subjectBreakdown={aggregateSubjectBreakdown}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={
                        s.status === "completed" || s.status === "failed"
                          ? `/interview/${s.id}/results`
                          : `/interview/${s.id}/record`
                      }
                      className="underline"
                    >
                      {s.role}
                    </Link>
                  </TableCell>
                  <TableCell>{s.company ?? "—"}</TableCell>
                  <TableCell>{s.interview_type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.status === "completed"
                          ? "default"
                          : s.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.overall_score ?? "—"}</TableCell>
                  <TableCell>
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
