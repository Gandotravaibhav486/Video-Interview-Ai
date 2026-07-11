import { createClient } from "@/lib/supabase/server";
import { createInterviewSession } from "@/lib/actions/sessions";
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

export default async function NewInterviewPage({
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
    .select("target_role, target_companies")
    .eq("id", user!.id)
    .single();

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Start a new mock interview</CardTitle>
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
  );
}
