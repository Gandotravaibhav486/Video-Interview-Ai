import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DeliveryBreakdownChart,
  SubjectBreakdownChart,
} from "@/components/interview/results-charts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) redirect("/dashboard");

  if (session.status === "failed") {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            We couldn&apos;t finish scoring this interview. Please try starting
            a new session.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (session.status !== "completed") {
    redirect(`/interview/${sessionId}/processing`);
  }

  const { data: questions } = await supabase
    .from("session_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .in("question_id", (questions ?? []).map((q) => q.id));

  const videoUrls: Record<string, string> = {};
  for (const answer of answers ?? []) {
    if (!answer.video_storage_path) continue;
    const { data } = await supabase.storage
      .from("recordings")
      .createSignedUrl(answer.video_storage_path, 3600);
    if (data) videoUrls[answer.question_id] = data.signedUrl;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {session.role}
          {session.company ? ` — ${session.company}` : ""}
        </h1>
        <p className="text-muted-foreground">
          {new Date(session.completed_at ?? session.created_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3">
            <span className="text-4xl font-bold">{session.overall_score}</span>
            <span className="text-lg text-muted-foreground">/ 100</span>
          </CardTitle>
          <CardDescription>{session.summary_feedback}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Delivery breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <DeliveryBreakdownChart scoreBreakdown={session.score_breakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Score by subject</CardTitle>
          </CardHeader>
          <CardContent>
            <SubjectBreakdownChart subjectBreakdown={session.subject_breakdown} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Per-question feedback</h2>
        {(questions ?? []).map((q) => {
          const answer = (answers ?? []).find((a) => a.question_id === q.id);
          const failed = answer?.feedback_status === "failed";
          return (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{q.subject}</Badge>
                  {failed && <Badge variant="destructive">Not scored</Badge>}
                </div>
                <CardTitle className="text-base font-medium">
                  {q.question_text}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {videoUrls[q.id] && (
                  <video
                    src={videoUrls[q.id]}
                    controls
                    className="aspect-video w-full max-w-md rounded-lg bg-black"
                  />
                )}
                {failed ? (
                  <p className="text-sm text-muted-foreground">
                    We couldn&apos;t process this answer due to a technical
                    issue on our end (nothing wrong with your answer) — it
                    isn&apos;t included in your scores above.
                  </p>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium">Transcript</p>
                      <p className="text-sm text-muted-foreground">
                        {answer?.transcript || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Feedback</p>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {answer?.answer_feedback || "—"}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
