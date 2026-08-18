"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import type { ExperienceLevel } from "@/lib/supabase/types";

// One question per screen, resume last. The old flow opened with a `required`
// file input, and every profile that stalled in onboarding stalled there with
// resume_prompted still false - neither the upload nor the skip was ever
// submitted. Asking for the file after four near-zero-effort screens is the
// standard recovery for that, and it costs nothing: the answers live in
// component state until the final submit, so a back-step never re-fetches and
// nothing is written until the student actually finishes.

type StepId = "welcome" | "name" | "experience" | "role" | "companies" | "resume";

const STEPS: StepId[] = [
  "welcome",
  "name",
  "experience",
  "role",
  "companies",
  "resume",
];

interface Answers {
  fullName: string;
  experienceLevel: ExperienceLevel;
  targetRole: string;
  targetCompanies: string;
  resume: File | null;
}

export function OnboardingFlow({
  defaultFullName,
  defaultTargetRole,
  defaultTargetCompanies,
}: {
  defaultFullName: string;
  defaultTargetRole: string;
  defaultTargetCompanies: string;
}) {
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({
    fullName: defaultFullName,
    experienceLevel: "campus_fresher",
    targetRole: defaultTargetRole,
    targetCompanies: defaultTargetCompanies,
    resume: null,
  });

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advancing is blocked only where an answer is genuinely required. Companies
  // and the resume are both optional, so their Continue is always live - the
  // student should never have to hunt for a skip control to get past them.
  const canAdvance =
    step === "name" ? answers.fullName.trim().length > 0
    : step === "role" ? answers.targetRole.trim().length > 0
    : true;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("full_name", answers.fullName.trim());
    formData.set("experience_level", answers.experienceLevel);
    formData.set("target_role", answers.targetRole.trim());
    formData.set("target_companies", answers.targetCompanies);
    if (answers.resume) formData.set("resume", answers.resume);

    try {
      await completeOnboarding(formData);
    } catch (err) {
      // A successful completeOnboarding never returns - it redirects, which
      // Next signals by throwing. Only a real failure lands here, and the
      // student keeps every answer they gave.
      if (err && typeof err === "object" && "digest" in err) throw err;
      setError(
        err instanceof Error ? err.message : "Could not finish setting up"
      );
      setSubmitting(false);
    }
  }, [answers]);

  const goNext = useCallback(() => {
    if (submitting) return;
    if (isLast) {
      void submit();
      return;
    }
    if (!canAdvance) return;
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [canAdvance, isLast, submit, submitting]);

  const goBack = useCallback(() => {
    if (submitting) return;
    setIndex((i) => Math.max(i - 1, 0));
  }, [submitting]);

  // Arrow-key navigation, advertised in the footer so it is discoverable
  // rather than a hidden trick. Ignored while the student is typing, or the
  // left arrow would jump screens mid-word.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.isContentEditable;
      if (e.key === "ArrowRight" && !typing) goNext();
      if (e.key === "ArrowLeft" && !typing) goBack();
      if (e.key === "Enter" && el?.tagName === "INPUT") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goBack]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header index={index} total={STEPS.length} onSkip={() => void submit()} />

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div key={step} className="step-enter w-full max-w-2xl text-center">
          {step === "welcome" && (
            <>
              <h1 className="text-display">Welcome to InterviewPrep.</h1>
              <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
                A few quick questions so your first interview is about the right
                role, at the right level. It takes under a minute.
              </p>
            </>
          )}

          {step === "name" && (
            <Question label="What should we call you?">
              <TextAnswer
                value={answers.fullName}
                onChange={(v) => setAnswers((a) => ({ ...a, fullName: v }))}
                placeholder="Your name"
                autoFocus
              />
            </Question>
          )}

          {step === "experience" && (
            <Question label="Where are you in your career?">
              <div className="mx-auto grid max-w-xl gap-x-10 sm:grid-cols-2">
                <ChoiceRow
                  label="I'm a student or fresher"
                  selected={answers.experienceLevel === "campus_fresher"}
                  onSelect={() =>
                    setAnswers((a) => ({
                      ...a,
                      experienceLevel: "campus_fresher",
                    }))
                  }
                />
                <ChoiceRow
                  label="I'm already working"
                  selected={answers.experienceLevel === "experienced"}
                  onSelect={() =>
                    setAnswers((a) => ({ ...a, experienceLevel: "experienced" }))
                  }
                />
              </div>
            </Question>
          )}

          {step === "role" && (
            <Question
              label="What role are you preparing for?"
              hint="One role. You can practise for others later."
            >
              <TextAnswer
                value={answers.targetRole}
                onChange={(v) => setAnswers((a) => ({ ...a, targetRole: v }))}
                placeholder="Software engineer, business analyst…"
                autoFocus
              />
            </Question>
          )}

          {step === "companies" && (
            <Question
              label="Any companies in mind?"
              hint="Separate with commas. Skip if you're not sure yet."
            >
              <TextAnswer
                value={answers.targetCompanies}
                onChange={(v) =>
                  setAnswers((a) => ({ ...a, targetCompanies: v }))
                }
                placeholder="TCS, Infosys, Amazon"
                autoFocus
              />
            </Question>
          )}

          {step === "resume" && (
            <Question
              label="Last one — add your resume."
              hint="We use it to ask about your actual projects. Optional, and you can add it later."
            >
              <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      resume: e.target.files?.[0] ?? null,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="pill"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {answers.resume ? "Choose a different file" : "Choose a PDF"}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {answers.resume
                    ? answers.resume.name
                    : "No file chosen — that's fine."}
                </p>
              </div>
            </Question>
          )}

          {error && (
            <p className="mt-8 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0 || submitting}
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
          >
            <span aria-hidden="true">←</span> Back
          </button>

          <p className="hidden text-xs text-muted-foreground sm:block">
            Use <span aria-hidden="true">←</span>{" "}
            <span aria-hidden="true">→</span> to navigate
          </p>

          <Button
            type="button"
            size="pill"
            onClick={goNext}
            disabled={!canAdvance || submitting}
          >
            {submitting
              ? "Setting up…"
              : isLast
                ? "Finish"
                : index === 0
                  ? "Let's begin"
                  : "Continue"}
            <span aria-hidden="true">→</span>
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Header({
  index,
  total,
  onSkip,
}: {
  index: number;
  total: number;
  onSkip: () => void;
}) {
  return (
    <header className="px-6 pt-6">
      {/* Two rows on mobile (wordmark + skip, then the progress bar beneath),
          collapsing to the single centred row on sm+. A one-row layout at
          375px clipped "Skip guide" off the edge and wrapped the counter
          onto three lines. */}
      <div className="mx-auto grid w-full max-w-5xl grid-cols-2 items-center gap-y-5 sm:grid-cols-[1fr_auto_1fr] sm:gap-y-0">
        <span className="text-display-sm">InterviewPrep</span>

        <button
          type="button"
          onClick={onSkip}
          className="justify-self-end text-sm text-muted-foreground transition-colors hover:text-foreground sm:order-3"
        >
          Skip guide
        </button>

        <div className="col-span-2 flex items-center justify-center gap-3 sm:order-2 sm:col-span-1">
          <span className="shrink-0 text-xs whitespace-nowrap tabular-nums text-muted-foreground">
            {index + 1} / {total}
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-0.5 w-7 rounded-full transition-colors sm:w-12 ${
                  i <= index ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <h1 className="text-display">{label}</h1>
      {hint && (
        <p className="mx-auto mt-5 max-w-md text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="mt-12">{children}</div>
    </>
  );
}

function TextAnswer({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    // Underlined rather than boxed: at this type size a bordered input reads
    // as a form field on a landing page, which is the look this flow exists
    // to get away from.
    <input
      type="text"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mx-auto block w-full max-w-md border-0 border-b border-input bg-transparent pb-3 text-center text-xl outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
    />
  );
}

function ChoiceRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-border py-4 text-left transition-colors hover:border-foreground/30"
    >
      <span
        aria-hidden="true"
        className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${
          selected ? "border-primary" : "border-input"
        }`}
      >
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="text-[0.9375rem]">{label}</span>
    </button>
  );
}
