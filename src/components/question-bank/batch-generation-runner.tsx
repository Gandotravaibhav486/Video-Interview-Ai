"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  generateForPairing,
  type PairingResult,
} from "@/lib/actions/question-bank-generation";
import type { PlacementPairing } from "@/lib/questions/placement-matrix";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type RowState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "done"; result: PairingResult };

// Spelled out rather than imported from the AI module: that module pulls in
// the Anthropic SDK, and importing a *value* from it here would drag the whole
// SDK into the client bundle. Type-only imports are erased, values are not.
const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

// Measured across a real 4-pairing run: 2.8, 2.8, 3.1 min. The earlier ~6 min
// figure came from a two-pairing sample that happened to include a slow
// outlier. Research dominates the time and varies with how much the web search
// has to dig, so treat this as a rough average rather than a per-pairing
// promise.
const MINUTES_PER_PAIRING = 2.9;

function formatEta(minutes: number): string {
  return minutes < 60
    ? `${Math.max(1, Math.round(minutes))} min`
    : `${(minutes / 60).toFixed(1)}h`;
}

// Each pairing is three sequential AI calls (research with web search, then
// generate, then verify). The whole batch is driven from the client one
// pairing at a time rather than looped server-side, because even at ~3 min
// each a full run is far past any serverless request limit.
export function BatchGenerationRunner({
  pairings,
  countPerPairing = 10,
}: {
  pairings: PlacementPairing[];
  countPerPairing?: number;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  // A ref, not state: the loop below reads this between iterations and would
  // otherwise close over a stale value from the render it started in.
  const stopRef = useRef(false);

  const key = (p: PlacementPairing) => `${p.role}@${p.company}`;

  async function runBatch() {
    stopRef.current = false;
    setRunning(true);
    setDoneCount(0);
    setStates({});

    let completed = 0;
    for (const p of pairings) {
      if (stopRef.current) break;
      const k = key(p);
      setStates((s) => ({ ...s, [k]: { status: "running" } }));

      let result: PairingResult;
      try {
        result = await generateForPairing({
          role: p.role,
          company: p.company,
          count: countPerPairing,
        });
      } catch (err) {
        // A thrown error here is a transport/timeout failure rather than a
        // generation failure - keep the batch going regardless.
        result = {
          role: p.role,
          company: p.company,
          status: "failed",
          added: 0,
          rejected: 0,
          usage: ZERO_USAGE,
          message: err instanceof Error ? err.message : "Request failed",
        };
      }

      setStates((s) => ({ ...s, [k]: { status: "done", result } }));
      completed += 1;
      setDoneCount(completed);
    }

    setRunning(false);
    router.refresh();
  }

  const totals = Object.values(states).reduce(
    (acc, s) => {
      if (s.status !== "done") return acc;
      acc.added += s.result.added;
      acc.rejected += s.result.rejected;
      acc.costUsd += s.result.usage.costUsd;
      if (s.result.status === "failed") acc.failed += 1;
      if (s.result.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { added: 0, rejected: 0, failed: 0, skipped: 0, costUsd: 0 }
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <Button onClick={() => void runBatch()}>
            Run {pairings.length} pairings
          </Button>
        ) : (
          <Button variant="outline" onClick={() => (stopRef.current = true)}>
            Stop after current pairing
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {running
            ? `Running ${doneCount + 1} of ${pairings.length} — roughly ${formatEta(
                (pairings.length - doneCount) * MINUTES_PER_PAIRING
              )} left`
            : doneCount > 0
              ? `Finished ${doneCount} of ${pairings.length}`
              : `About ${formatEta(
                  pairings.length * MINUTES_PER_PAIRING
                )} total at ~${MINUTES_PER_PAIRING} min per pairing`}
        </span>
      </div>

      {doneCount > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <span className="font-medium">{totals.added}</span> questions added
          </span>
          <span className="text-muted-foreground">
            {totals.rejected} rejected by verification
          </span>
          {totals.skipped > 0 && (
            <span className="text-muted-foreground">
              {totals.skipped} already existed
            </span>
          )}
          {totals.failed > 0 && (
            <span className="text-red-600">{totals.failed} failed</span>
          )}
          <span className="font-medium">
            ${totals.costUsd.toFixed(2)} spent
          </span>
        </div>
      )}

      {(running || doneCount > 0) && (
        <Progress value={(doneCount / pairings.length) * 100} />
      )}

      <div className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border">
        {pairings.map((p) => {
          const state = states[key(p)] ?? { status: "pending" as const };
          return (
            <div
              key={key(p)}
              className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{p.role}</span>
                <span className="text-muted-foreground">@ {p.company}</span>
              </span>
              {state.status === "pending" && (
                <span className="text-xs text-muted-foreground">waiting</span>
              )}
              {state.status === "running" && (
                <span className="text-xs">researching…</span>
              )}
              {state.status === "done" && (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {state.result.message}
                  </span>
                  <Badge
                    variant={
                      state.result.status === "generated"
                        ? "default"
                        : state.result.status === "skipped"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {state.result.status}
                  </Badge>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
