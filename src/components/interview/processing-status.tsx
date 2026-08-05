"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { retryLiveScoring } from "@/lib/actions/live-interview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const POLL_INTERVAL_MS = 4000;

// A session sitting on "processing" with a stale updated_at for this long is
// treated as stuck rather than still working. Well above the "usually takes
// under a couple of minutes" the UI itself already promises, so this never
// fires on a session that's merely slow - only one whose background job
// actually died (confirmed for real: a crashed dev server left a session's
// updated_at frozen indefinitely, with nothing in the app ever calling
// scoreLiveSession() again on its own).
const STUCK_THRESHOLD_MS = 3 * 60 * 1000;

export function ProcessingStatus({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "completed" || data.status === "failed") {
          router.push(`/interview/${sessionId}/results`);
          return;
        }
        setMode(data.mode ?? null);
        const updatedAt = data.updatedAt ? new Date(data.updatedAt).getTime() : null;
        setStuck(
          data.status === "processing" &&
            updatedAt !== null &&
            Date.now() - updatedAt > STUCK_THRESHOLD_MS
        );
      } catch {
        // transient network error - keep polling
      }
      if (!cancelled) {
        setTimeout(() => setAttempt((a) => a + 1), POLL_INTERVAL_MS);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryLiveScoring(sessionId);
      // Scoring runs in the background (after()) - give it a moment before
      // the next poll checks again, same cadence as the normal loop.
      setStuck(false);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Scoring your interview…</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          We&apos;re transcribing your answers and generating feedback on
          content, delivery, and professionalism. This usually takes under a
          couple of minutes.
        </p>
        {stuck && mode === "live" && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm text-amber-800">
              This is taking longer than expected — scoring may have been
              interrupted. You can retry without losing anything already
              scored.
            </p>
            {retryError && <p className="text-sm text-red-600">{retryError}</p>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={() => void handleRetry()}
            >
              {retrying ? "Retrying…" : "Retry scoring"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
