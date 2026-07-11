import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "@/lib/actions/onboarding";
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

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Tell us about your target role</CardTitle>
        <CardDescription>
          This tailors which questions from the bank get picked for your mock
          interviews.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveOnboarding} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={profile?.full_name ?? ""}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="target_role">Target role</Label>
            <Input
              id="target_role"
              name="target_role"
              placeholder="sde, software_engineer, business_analyst..."
              defaultValue={profile?.target_role ?? ""}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="target_companies">
              Target companies (comma separated, optional)
            </Label>
            <Input
              id="target_companies"
              name="target_companies"
              placeholder="tcs, infosys, amazon"
              defaultValue={profile?.target_companies?.join(", ") ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="experience_level">Experience level</Label>
            <Select
              name="experience_level"
              defaultValue={profile?.experience_level ?? "campus_fresher"}
            >
              <SelectTrigger id="experience_level" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="campus_fresher">Campus fresher</SelectItem>
                <SelectItem value="experienced">Experienced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="resume">Resume (PDF, optional)</Label>
            <Input id="resume" name="resume" type="file" accept="application/pdf" />
            <p className="text-xs text-muted-foreground">
              We summarize your resume to help personalize question selection.
            </p>
          </div>
          <Button type="submit" className="mt-2">
            Save and continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
