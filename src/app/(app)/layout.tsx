import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { AppNav } from "@/components/app-nav";

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
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/dashboard" className="text-display-sm shrink-0">
            InterviewPrep
          </Link>
          <AppNav isAdmin={profile.is_admin} />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
