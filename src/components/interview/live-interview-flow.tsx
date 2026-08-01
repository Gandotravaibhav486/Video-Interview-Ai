"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useInterviewRecorder } from "@/hooks/useInterviewRecorder";
import { useSilenceDetection } from "@/hooks/useSilenceDetection";
import { submitTurn } from "@/lib/actions/live-interview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TranscriptLine {
  speaker: "agent" | "candidate";
  text: string;
}

// Per-turn phase, distinct from the batch flow's phases: there is no
// "review/retake" step here - a turn is transcribed and sent to the
// interviewer as soon as speech ends, since the whole point is a live
// back-and-forth rather than a reviewable recording.
type Phase = "idle" | "recording" | "submitting" | "done";

export function LiveInterviewFlow({
  sessionId,
  userId,
  initialUtterance,
  initialTurnCounter,
}: {
  sessionId: string;
  userId: string;
  initialUtterance: string | null;
  initialTurnCounter: number;
}) {
  const router = useRouter();
  const recorder = useInterviewRecorder();
  const silence = useSilenceDetection();

  const [transcript, setTranscript] = useState<TranscriptLine[]>(
    initialUtterance ? [{ speaker: "agent", text: initialUtterance }] : []
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Purely a storage-path counter, decoupled from the DB's own turn_index
  // sequence (which the server derives independently from live_turns) - this
  // only needs to keep upload paths from colliding within the session.
  const turnCounterRef = useRef(initialTurnCounter);

  useEffect(() => {
    recorder.setupCamera();
    return () => {
      silence.stop();
      recorder.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginTurn() {
    setError(null);
    setPhase("recording");
    recorder.startAudioTurn();
    const stream = recorder.getStream();
    if (stream) {
      silence.start(stream, () => void finishTurn());
    }
  }

  async function finishTurn() {
    silence.stop();
    setPhase("submitting");

    try {
      const { audioBlob, frameBlobs, durationSeconds } =
        await recorder.stopAudioTurn();

      const turnNumber = turnCounterRef.current;
      turnCounterRef.current += 1;

      const supabase = createClient();

      const audioPath = `${userId}/${sessionId}/turn-${turnNumber}.webm`;
      const { error: audioUploadError } = await supabase.storage
        .from("recordings")
        .upload(audioPath, audioBlob, {
          upsert: true,
          contentType: "audio/webm",
        });
      if (audioUploadError) throw new Error(audioUploadError.message);

      const framePaths: string[] = [];
      for (let i = 0; i < frameBlobs.length; i++) {
        const framePath = `${userId}/${sessionId}/turn-${turnNumber}/frame-${i}.jpg`;
        const { error: frameUploadError } = await supabase.storage
          .from("frames")
          .upload(framePath, frameBlobs[i], {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (!frameUploadError) framePaths.push(framePath);
      }

      const result = await submitTurn({
        sessionId,
        audioStoragePath: audioPath,
        audioDurationSeconds: durationSeconds,
        framePaths,
      });

      setTranscript((prev) => [
        ...prev,
        { speaker: "candidate", text: result.candidateTranscript },
        { speaker: "agent", text: result.utterance },
      ]);

      if (result.done) {
        setPhase("done");
        recorder.release();
        router.push(`/interview/${sessionId}/processing`);
      } else {
        setPhase("idle");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit your answer"
      );
      setPhase("idle");
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-normal">Live interview</CardTitle>
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
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-md border p-3">
            {transcript.map((line, i) => (
              <p key={i} className="text-sm">
                <span className="font-medium">
                  {line.speaker === "agent" ? "Interviewer: " : "You: "}
                </span>
                {line.text}
              </p>
            ))}
            {phase === "submitting" && (
              <p className="text-sm text-muted-foreground">Thinking…</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {phase === "recording"
                ? "Listening — pause when you're done answering."
                : phase === "submitting"
                  ? "Processing your answer…"
                  : phase === "done"
                    ? "Interview complete."
                    : "Ready when you are."}
            </span>

            {phase === "idle" && (
              <Button onClick={() => void beginTurn()} disabled={!recorder.isReady}>
                Start answering
              </Button>
            )}
            {phase === "recording" && (
              <Button onClick={() => void finishTurn()} variant="outline">
                Done answering
              </Button>
            )}
            {phase === "submitting" && <Button disabled>Processing…</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
