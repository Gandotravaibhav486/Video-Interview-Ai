import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/supabase/ensure-profile";

export default async function OnboardingLayout({
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

  // Guarantee the profile row exists, but deliberately don't gate on
  // onboarding_completed here - that check lives in (app)/layout.tsx so
  // this route is reachable regardless of onboarding progress.
  await ensureProfile(supabase, user);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
