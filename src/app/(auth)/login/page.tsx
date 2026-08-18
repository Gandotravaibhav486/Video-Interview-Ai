import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Practice your placement interviews with AI feedback.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notice && (
          <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
            {notice}
          </p>
        )}
        <form action={signIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Link
                href="/signup"
                className="mt-1 inline-block text-sm underline"
              >
                Create an account
              </Link>
            </div>
          )}
          <SubmitButton pendingText="Signing you in…" className="w-full">
            Log in
          </SubmitButton>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
