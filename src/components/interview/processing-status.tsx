"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const POLL_INTERVAL_MS = 4000;

export function ProcessingStatus({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);

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

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Scoring your interview…</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          We&apos;re transcribing your answers and generating feedback on
          content, delivery, and professionalism. This usually takes under a
          couple of minutes.
        </p>
      </CardContent>
    </Card>
  );
}
