import { uploadResume } from "@/lib/actions/onboarding";
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

export default async function ResumeUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect_to?: string }>;
}) {
  const { error, redirect_to } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload your resume</CardTitle>
        <CardDescription>
          This replaces any resume already on file, and regenerates your
          Domain Interview questions from it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={uploadResume} className="flex flex-col gap-4">
          <input
            type="hidden"
            name="redirect_to"
            value={redirect_to || "/dashboard"}
          />
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
      </CardContent>
    </Card>
  );
}
