"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Derived from the incoming request rather than a static env var, so the
// confirmation-email redirect is always correct across local dev, Vercel
// preview deployments, and production without needing per-environment
// config to stay in sync (this is what caused confirmation links to
// dead-end at localhost:3000 when clicked from a deployed environment).
async function getOrigin(): Promise<string> {
  const headersList = await headers();
  const origin = headersList.get("origin");
  if (origin) return origin;

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol =
    headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * Turns a Supabase auth error into something a student can act on.
 *
 * Deliberately does NOT distinguish "no such account" from "wrong password".
 * Supabase collapses both into `invalid_credentials` on purpose, and verified
 * against this project: a nonexistent address and a real address with a bad
 * password both return HTTP 400 / "Invalid login credentials", byte for byte.
 * Telling them apart would mean adding a lookup that confirms whether an email
 * is registered - an account-enumeration oracle on a product holding students'
 * interview recordings and resumes. The copy points at sign-up instead, which
 * is the action a new user needs either way.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match an account. Check them and try again — or create an account if you're new here.";
  }
  if (m.includes("email not confirmed")) {
    return "Your account isn't confirmed yet. Check your inbox for the confirmation link.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const fullName = String(formData.get("fullName") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${(await getOrigin())}/login`,
    },
  });

  if (error) {
    redirect(
      `/signup?error=${encodeURIComponent(friendlyAuthError(error.message))}`
    );
  }

  // signUp succeeds even when email confirmation is required - Supabase
  // just withholds the session until the link is clicked. That case has
  // no session yet, so redirecting straight to /onboarding silently
  // bounces to /login with zero explanation. Tell the student what
  // actually happened instead.
  if (!data.session) {
    redirect(
      `/login?notice=${encodeURIComponent(
        "Account created — check your email to confirm it before logging in."
      )}`
    );
  }

  redirect("/onboarding");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createClient();
  const {
    error,
    data: { user },
  } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user!.id)
    .maybeSingle();

  redirect(profile?.onboarding_completed ? "/dashboard" : "/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
