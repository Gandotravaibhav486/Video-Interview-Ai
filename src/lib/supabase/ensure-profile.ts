import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database, Profile } from "@/lib/supabase/types";

// Normally handle_new_user() creates a profiles row on signup. Self-heal here
// in case that trigger didn't fire, so a missing profile never blocks the
// rest of the app (e.g. the interview_sessions FK to profiles.id). Shared by
// every layout that needs a guaranteed profile row before rendering.
export async function ensureProfile(
  supabase: SupabaseClient<Database>,
  user: User
): Promise<Profile> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) return profile;

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create profile");
  }

  return created;
}
