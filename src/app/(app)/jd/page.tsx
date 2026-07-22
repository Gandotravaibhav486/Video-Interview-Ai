import { createClient } from "@/lib/supabase/server";
import {
  submitJobDescription,
  startInterviewFromJobDescription,
} from "@/lib/actions/job-descriptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DEFAULT_QUESTION_COUNT = 6;

export default async function JobDescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobDescriptions } = await supabase
    .from("job_descriptions")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const jdIds = (jobDescriptions ?? []).map((jd) => jd.id);
  const { data: allCustomQuestions } =
    jdIds.length > 0
      ? await supabase
          .from("custom_questions")
          .select("id, job_description_id")
          .in("job_description_id", jdIds)
      : { data: [] };

  const questionCountByJd = new Map<string, number>();
  for (const q of allCustomQuestions ?? []) {
    questionCountByJd.set(
      q.job_description_id,
      (questionCountByJd.get(q.job_description_id) ?? 0) + 1
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Job descriptions</h1>
        <p className="text-muted-foreground">
          Paste a real job posting and get a mock interview tailored to it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a job description</CardTitle>
          <CardDescription>
            We&apos;ll extract the role, required skills, and generate
            questions specific to this posting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitJobDescription} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="jd_text">Job description</Label>
              <Textarea
                id="jd_text"
                name="jd_text"
                rows={12}
                placeholder="Paste the full job posting here..."
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit">Generate questions</Button>
          </form>
        </CardContent>
      </Card>

      {(jobDescriptions ?? []).length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Your job descriptions</h2>
          {(jobDescriptions ?? []).map((jd) => {
            const questionCount = questionCountByJd.get(jd.id) ?? 0;
            return (
              <Card key={jd.id}>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    {jd.role}
                    {jd.company ? ` — ${jd.company}` : ""}
                  </CardTitle>
                  <CardDescription>
                    {jd.seniority ? `${jd.seniority} · ` : ""}
                    {questionCount} question{questionCount === 1 ? "" : "s"}{" "}
                    generated
                    {jd.status === "failed" && " · generation failed"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {jd.required_skills.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                    {jd.subjects.map((subject) => (
                      <Badge key={subject} variant="secondary">
                        {subject}
                      </Badge>
                    ))}
                  </div>
                  {questionCount > 0 && (
                    <form
                      action={startInterviewFromJobDescription}
                      className="flex items-end gap-3"
                    >
                      <input
                        type="hidden"
                        name="job_description_id"
                        value={jd.id}
                      />
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`question_count_${jd.id}`}>
                          Number of questions
                        </Label>
                        <Input
                          id={`question_count_${jd.id}`}
                          name="question_count"
                          type="number"
                          min={1}
                          max={questionCount}
                          defaultValue={Math.min(
                            DEFAULT_QUESTION_COUNT,
                            questionCount
                          )}
                          className="w-32"
                        />
                      </div>
                      <Button type="submit">Start interview</Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
