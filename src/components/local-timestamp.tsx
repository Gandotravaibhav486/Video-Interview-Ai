"use client";

// Server Components render toLocaleString() in the server's timezone (UTC on
// Vercel), not the visitor's - this renders client-side instead so it picks
// up the browser's actual local timezone.
export function LocalTimestamp({
  iso,
  dateOnly,
}: {
  iso: string;
  dateOnly?: boolean;
}) {
  const date = new Date(iso);
  return <>{dateOnly ? date.toLocaleDateString() : date.toLocaleString()}</>;
}
