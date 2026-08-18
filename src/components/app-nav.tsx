"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// Four nav items plus a wordmark do not fit on one 375px row. Wrapping them
// (the previous fix) technically avoided clipping but pushed "Sign out" onto
// a third line and left the group flush-left, reading as a broken layout on a
// real handset. A disclosure menu keeps the nav where it belongs - top right -
// at every width.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/interview/new", label: "New interview" },
] as const;

export function AppNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const links = isAdmin
    ? [...LINKS, { href: "/question-bank", label: "Question bank" } as const]
    : [...LINKS];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="relative flex items-center">
      {/* sm+ : everything inline, right-aligned. */}
      <div className="hidden items-center gap-5 text-sm sm:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap">
            {l.label}
          </Link>
        ))}
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      {/* below sm : a single 44px control, and the panel anchored to it. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="app-nav-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid size-11 place-items-center rounded-full transition-colors hover:bg-muted sm:hidden"
      >
        {open ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id="app-nav-menu"
          className="absolute top-full right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border bg-card shadow-lg sm:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center px-4 text-sm transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          <form action={signOut} className="border-t">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center px-4 text-left text-sm transition-colors hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
