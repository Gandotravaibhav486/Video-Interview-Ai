import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await ensureProfile(supabase, user);

  if (!profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        {/* Wraps to a second row below sm. At 375px a single row ran the
            wordmark straight into the first nav link ("InterviewPrepDashboard")
            and broke "New interview" across two lines - justify-between gives
            no gap once the links group is as wide as the space left. */}
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4">
          <Link href="/dashboard" className="text-display-sm w-full sm:mr-auto sm:w-auto">
            InterviewPrep
          </Link>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/dashboard" className="-my-3 py-3 whitespace-nowrap">
              Dashboard
            </Link>
            <Link href="/interview/new" className="-my-3 py-3 whitespace-nowrap">
              New interview
            </Link>
            {profile.is_admin && (
              <Link href="/question-bank" className="-my-3 py-3 whitespace-nowrap">
                Question bank
              </Link>
            )}
            <form action={signOut}>
              <Button variant="ghost" size="sm" className="h-11 sm:h-7" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
