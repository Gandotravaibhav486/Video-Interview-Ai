"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// useFormStatus reads the nearest parent <form>'s pending state, which only
// works from inside a Client Component rendered as a form's descendant - the
// page itself stays a Server Component, this is the one small client piece
// it needs. Without this, a slow real request (the JD/resume forms chain
// 2-3 sequential AI calls, realistically 15-30+ seconds) looks visually
// identical to a broken one, which is exactly what caused a real duplicate
// submission - same button, no feedback, clicked three times.
export function SubmitButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
