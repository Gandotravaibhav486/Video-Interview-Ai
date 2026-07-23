import { type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { notifyVisit } from "@/lib/notify/visit";

const VISIT_COOKIE = "visit_notified";
const VISIT_COOKIE_MAX_AGE_SECONDS = 6 * 60 * 60; // throttle to 1 email per visitor per 6h

// A "real" page visit, not an API call, a prefetch, or a client-side
// soft-navigation fetch for RSC data - sec-fetch-mode is "navigate" only for
// actual top-level browser navigations (typed URL, link click, reload).
function isRealPageVisit(request: NextRequest): boolean {
  return (
    request.method === "GET" &&
    !request.nextUrl.pathname.startsWith("/api") &&
    request.headers.get("sec-fetch-mode") === "navigate"
  );
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await updateSession(request);

  if (
    process.env.VERCEL_ENV === "production" &&
    isRealPageVisit(request) &&
    !request.cookies.has(VISIT_COOKIE)
  ) {
    event.waitUntil(notifyVisit(request));
    response.cookies.set(VISIT_COOKIE, "1", {
      maxAge: VISIT_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
