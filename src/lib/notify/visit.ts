import type { NextRequest } from "next/server";

// Fire-and-forget email notification for a real page visit, called from
// proxy.ts via event.waitUntil() so it never blocks or breaks the actual
// response. Silently no-ops if RESEND_API_KEY isn't configured (e.g. local
// dev) - this must never throw and take the site down with it.
export async function notifyVisit(request: NextRequest): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!apiKey || !notifyEmail) return;

  const pathname = request.nextUrl.pathname;
  const referrer = request.headers.get("referer") || "(direct)";
  const userAgent = request.headers.get("user-agent") || "(unknown)";
  const timestamp = new Date().toISOString();

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "InterviewPrep <onboarding@resend.dev>",
        to: [notifyEmail],
        subject: `New visit: ${pathname}`,
        text: `Someone opened mockintervew.com\n\nPath: ${pathname}\nTime (UTC): ${timestamp}\nReferrer: ${referrer}\nUser-Agent: ${userAgent}`,
      }),
    });
  } catch (err) {
    // Best-effort only - a failed notification should never affect the
    // actual site response.
    console.error("Visit notification failed:", err);
  }
}
