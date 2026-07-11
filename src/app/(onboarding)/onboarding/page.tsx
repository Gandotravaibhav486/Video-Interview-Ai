import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  uploadResume,
  skipResumeUpload,
  saveProfileDetails,
} from "@/lib/actions/onboarding";
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

export default async function OnboardingPage({
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
    .select("*")
    .eq("id", user!.id)
    .single();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  if (!profile?.resume_prompted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload your resume</CardTitle>
          <CardDescription>
            You can skip this if you don&apos;t have one ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form action={uploadResume} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="resume">Resume (PDF)</Label>
              <Input
                id="resume"
                name="resume"
                type="file"
                accept="application/pdf"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit">Upload</Button>
          </form>
          <form action={skipResumeUpload}>
            <Button type="submit" variant="ghost" className="w-full">
              Skip for now
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your details</CardTitle>
        <CardDescription>
          {warning === "resume_parse_failed"
            ? "We couldn't read that resume, so these are blank — fill them in manually."
            : "We've pre-filled these from your resume — edit anything before continuing."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={saveProfileDetails} className="flex flex-col gap-4">
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
          <Button type="submit" className="mt-2">
            Save and continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
