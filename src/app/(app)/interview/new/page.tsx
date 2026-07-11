import { createClient } from "@/lib/supabase/server";
import { createInterviewSession } from "@/lib/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DEFAULT_SUGGESTION_QUESTION_COUNT = 5;

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; warning?: string }>;
}) {
  const { error, warning } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_role, target_companies, suggested_interviews")
    .eq("id", user!.id)
    .single();

  const suggestions = profile?.suggested_interviews ?? [];
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      {warning === "resume_parse_failed" && (
        <p className="text-sm text-amber-600">
          We couldn&apos;t generate suggestions from your resume, but you can
          still set up an interview manually below.
        </p>
      )}

      {hasSuggestions && (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Suggested for you</h1>
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
                <form action={createInterviewSession}>
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
                  <Button type="submit">Start this interview</Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {hasSuggestions ? "Or set up manually" : "Start a new mock interview"}
          </CardTitle>
          <CardDescription>
            We&apos;ll auto-select a balanced mix of questions from the bank
            matching your role and interview type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInterviewSession} className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="interview_type">Interview type</Label>
              <Select name="interview_type" defaultValue="hr_mixed">
                <SelectTrigger id="interview_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr_mixed">Mixed (HR + technical)</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="company_specific">
                    Company-specific
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="question_count">Number of questions</Label>
              <Input
                id="question_count"
                name="question_count"
                type="number"
                min={3}
                max={10}
                defaultValue={5}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="mt-2">
              Start interview
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
