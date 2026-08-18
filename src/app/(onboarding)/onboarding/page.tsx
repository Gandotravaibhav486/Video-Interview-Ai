import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, target_role, target_companies, onboarding_completed")
    .eq("id", user!.id)
    .single();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  // Defaults only. Every answer lives in the flow's own state from here on,
  // and nothing is written until the student finishes - so this page renders
  // once and never re-fetches between steps.
  return (
    <OnboardingFlow
      defaultFullName={profile?.full_name ?? ""}
      defaultTargetRole={profile?.target_role ?? ""}
      defaultTargetCompanies={profile?.target_companies?.join(", ") ?? ""}
    />
  );
}
