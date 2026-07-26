"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useInterviewRecorder } from "@/hooks/useInterviewRecorder";
import { submitAnswer, markSessionProcessing } from "@/lib/actions/answers";
import type { SessionQuestion } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RecordingFlow({
  sessionId,
  questions,
  userId,
}: {
  sessionId: string;
  questions: SessionQuestion[];
  userId: string;
}) {
  const router = useRouter();
  const recorder = useInterviewRecorder();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "review" | "uploading">(
    "idle"
  );
  const [attempt, setAttempt] = useState(1);
  const [capturedDuration, setCapturedDuration] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef<{
    videoBlob: Blob;
    frameBlobs: Blob[];
    durationSeconds: number;
  } | null>(null);

  const question = questions[index];
  const isLast = index === questions.length - 1;

  // Extension seam: counts tab-switches/window-blurs during recording. Not
  // persisted yet (answers.integrity_flags is unused in MVP) - wiring this
  // counter into submitAnswer's payload is the intended hook-up point once
  // cheating detection ships.
  const integrityFlagsRef = useRef({ blurCount: 0, visibilityChangeCount: 0 });

  useEffect(() => {
    recorder.setupCamera();

    function onBlur() {
      integrityFlagsRef.current.blurCount += 1;
    }
    function onVisibilityChange() {
      if (document.hidden) integrityFlagsRef.current.visibilityChangeCount += 1;
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      recorder.release();
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginAnswer() {
    setPhase("recording");
    setTimeLeft(question.time_limit_seconds);
    recorder.startRecording();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          void stopAndReview();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  // Stops the recorder and holds the result for review - nothing is
  // uploaded or submitted yet, so a discarded attempt (via retakeAnswer)
  // never costs a Storage upload or an AI scoring call.
  async function stopAndReview() {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const captured = await recorder.stopRecording();
      capturedRef.current = captured;
      setCapturedDuration(captured.durationSeconds);
      setPhase("review");
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to stop recording"
      );
      setPhase("idle");
    }
  }

  function retakeAnswer() {
    capturedRef.current = null;
    setCapturedDuration(null);
    setAttempt((a) => a + 1);
    setPhase("idle");
  }

  async function submitCapturedAnswer() {
    const captured = capturedRef.current;
    if (!captured) return;
    setPhase("uploading");
    setUploadError(null);

    try {
      const { videoBlob, frameBlobs, durationSeconds } = captured;
      const supabase = createClient();

      const videoPath = `${userId}/${sessionId}/${question.id}.webm`;
      const { error: videoUploadError } = await supabase.storage
        .from("recordings")
        .upload(videoPath, videoBlob, { upsert: true, contentType: "video/webm" });
      if (videoUploadError) throw new Error(videoUploadError.message);

      const framePaths: string[] = [];
      for (let i = 0; i < frameBlobs.length; i++) {
        const framePath = `${userId}/${sessionId}/${question.id}/frame-${i}.jpg`;
        const { error: frameUploadError } = await supabase.storage
          .from("frames")
          .upload(framePath, frameBlobs[i], {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (!frameUploadError) framePaths.push(framePath);
      }

      await submitAnswer({
        questionId: question.id,
        videoStoragePath: videoPath,
        videoDurationSeconds: durationSeconds,
        framePaths,
      });

      capturedRef.current = null;
      setCapturedDuration(null);

      if (isLast) {
        await markSessionProcessing(sessionId);
        recorder.release();
        router.push(`/interview/${sessionId}/processing`);
      } else {
        setIndex((i) => i + 1);
        setAttempt(1);
        setPhase("idle");
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to submit your answer"
      );
      // Keep the captured attempt and land back on review rather than idle -
      // a failed upload shouldn't cost them the recording they already have.
      setPhase("review");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{question.subject}</Badge>
        <span className="text-sm text-muted-foreground">
          Question {index + 1} of {questions.length}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-normal">
            {question.question_text}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <video
            ref={recorder.attachVideoEl}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full rounded-lg bg-black object-cover"
          />

          {recorder.error && (
            <div className="flex items-center justify-between gap-4 rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-600">{recorder.error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void recorder.setupCamera()}
              >
                Try again
              </Button>
            </div>
          )}
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

          <div className="flex items-center justify-between">
            {phase === "recording" ? (
              <span className="text-sm font-medium">
                Recording — {timeLeft}s left
              </span>
            ) : phase === "review" ? (
              <span className="text-sm text-muted-foreground">
                Attempt {attempt} recorded ({Math.round(capturedDuration ?? 0)}s)
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Time limit: {question.time_limit_seconds}s
              </span>
            )}

            {phase === "idle" && (
              <Button onClick={beginAnswer} disabled={!recorder.isReady}>
                Start answering
              </Button>
            )}
            {phase === "recording" && (
              <Button onClick={() => void stopAndReview()} variant="outline">
                Stop recording
              </Button>
            )}
            {phase === "review" && (
              <div className="flex items-center gap-3">
                {attempt < 2 && (
                  <Button variant="outline" onClick={retakeAnswer}>
                    Retake
                  </Button>
                )}
                <Button onClick={() => void submitCapturedAnswer()}>
                  Submit answer
                </Button>
              </div>
            )}
            {phase === "uploading" && <Button disabled>Uploading…</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
