"use client";

import { useCallback, useRef, useState } from "react";

export interface CapturedTurn {
  audioBlob: Blob;
  frameBlobs: Blob[];
  durationSeconds: number;
}

// Caps how many frames a live turn samples. assembleQuestionMedia() already
// downsamples across a question's turns to 8 total - capturing more here
// than that ceiling needs would just mean discarding frames later instead of
// not taking them.
const LIVE_MAX_FRAMES_PER_TURN = 6;
const LIVE_FRAME_INTERVAL_MS = 3000;

// getUserMedia throws different DOMException names for genuinely different
// problems - surfacing the right one avoids telling a user to "grant
// permission" when the real issue is no camera exists, or it's in use by
// another app.
function describeMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : undefined;
  switch (name) {
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera or microphone was found on this device. Make sure one is connected and not disabled, then try again.";
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera/microphone access was denied. Allow access for this site in your browser settings, then try again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your camera or microphone is already in use by another app or browser tab. Close it and try again.";
    case "OverconstrainedError":
      return "Your camera doesn't support the required video settings. Try a different camera if you have one.";
    default:
      return err instanceof Error
        ? err.message
        : "Could not access your camera or microphone.";
  }
}

// Owns the camera MediaStream and the live per-turn audio recorder.
// `getStream()` is the extension seam a future `useFaceTracking` hook
// (MediaPipe FaceMesh) would tap to compute eye-contact/posture signals from
// the same stream without refactoring the live interview page.
export function useInterviewRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const turnFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const turnFrameBlobsRef = useRef<Blob[]>([]);
  const turnFrameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnStartTimeRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attachVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
    }
  }, []);

  const setupCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        // echoCancellation/noiseSuppression matter most once live mode plays
        // agent audio back through speakers (a later phase - v1 is text on
        // screen) into the same mic.
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoElRef.current) {
        videoElRef.current.srcObject = stream;
      }
      setIsReady(true);
    } catch (err) {
      setError(describeMediaError(err));
    }
  }, []);

  const captureTurnFrame = useCallback(() => {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = turnFrameCanvasRef.current ?? document.createElement("canvas");
    turnFrameCanvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob && turnFrameBlobsRef.current.length < LIVE_MAX_FRAMES_PER_TURN) {
          turnFrameBlobsRef.current.push(blob);
        }
      },
      "image/jpeg",
      0.7
    );
  }, []);

  // Audio-only per-utterance recorder for live mode. A separate MediaStream
  // wrapping just the audio track(s) - not a clone of the hardware capture,
  // just an audio-only view of the same stream setupCamera already opened -
  // so this can run every turn without touching the shared video pipeline.
  // Recording video here would cost ~9x the bytes on the turn-latency-
  // critical upload path (see assemble-question-media.ts) for a track
  // scoreAnswer() never looks at: frames come from captureTurnFrame() above,
  // drawn straight off the live <video> element.
  const startAudioTurn = useCallback(() => {
    if (!streamRef.current) return;
    turnChunksRef.current = [];
    turnFrameBlobsRef.current = [];
    turnStartTimeRef.current = Date.now();

    const audioStream = new MediaStream(streamRef.current.getAudioTracks());
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(audioStream, {
      mimeType,
      audioBitsPerSecond: 48_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) turnChunksRef.current.push(e.data);
    };
    recorder.start();
    turnRecorderRef.current = recorder;

    captureTurnFrame();
    turnFrameIntervalRef.current = setInterval(captureTurnFrame, LIVE_FRAME_INTERVAL_MS);
  }, [captureTurnFrame]);

  const stopAudioTurn = useCallback((): Promise<CapturedTurn> => {
    return new Promise((resolve, reject) => {
      const recorder = turnRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("Not recording a turn"));
        return;
      }
      if (turnFrameIntervalRef.current) {
        clearInterval(turnFrameIntervalRef.current);
        turnFrameIntervalRef.current = null;
      }
      recorder.onstop = () => {
        const audioBlob = new Blob(turnChunksRef.current, {
          type: "audio/webm",
        });
        const durationSeconds = (Date.now() - turnStartTimeRef.current) / 1000;
        resolve({
          audioBlob,
          frameBlobs: turnFrameBlobsRef.current,
          durationSeconds,
        });
      };
      recorder.stop();
    });
  }, []);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsReady(false);
  }, []);

  return {
    attachVideoEl,
    setupCamera,
    startAudioTurn,
    stopAudioTurn,
    release,
    isReady,
    error,
    getStream: () => streamRef.current,
  };
}
