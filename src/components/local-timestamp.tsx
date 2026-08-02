"use client";

import { useSyncExternalStore } from "react";

// Renders a timestamp in the visitor's own timezone and locale.
//
// The subtlety: "use client" does NOT mean client-only - the component still
// server-renders during SSR. Calling toLocaleDateString() directly therefore
// runs twice against different environments (Node's locale/timezone on the
// server, the browser's on the client) and the two disagree - e.g. 8/1/2026
// vs 01/08/2026 - which fails hydration.
//
// So the first paint (server and initial client render alike) uses a
// deterministic slice of the ISO string, which cannot differ between them,
// and the locale-aware formatting is swapped in after mount.

function stableFallback(iso: string, dateOnly?: boolean): string {
  // Sliced rather than parsed: no Date, no locale, no timezone - byte-identical
  // on both sides by construction.
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}

// useSyncExternalStore is the built-in way to have a value differ between the
// server render and the client: getServerSnapshot feeds SSR and the hydrating
// render, getSnapshot takes over afterwards. Nothing is ever subscribed to
// here - the store never changes - so subscribe is a no-op unsubscriber.
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function LocalTimestamp({
  iso,
  dateOnly,
}: {
  iso: string;
  dateOnly?: boolean;
}) {
  const hydrated = useSyncExternalStore(neverChanges, onClient, onServer);

  if (!hydrated) {
    return <span>{stableFallback(iso, dateOnly)}</span>;
  }

  const date = new Date(iso);
  return (
    <span>{dateOnly ? date.toLocaleDateString() : date.toLocaleString()}</span>
  );
}
