"use client";

import { useCallback, useRef, useState } from "react";

export interface CapturedAnswer {
  videoBlob: Blob;
  frameBlobs: Blob[];
  durationSeconds: number;
}

export interface CapturedTurn {
  audioBlob: Blob;
  frameBlobs: Blob[];
  durationSeconds: number;
}

const MAX_FRAMES = 8;
const FRAME_INTERVAL_MS = 4000;

// Live mode samples fewer frames per turn than a batch answer, since a turn
// is typically one exchange (seconds to a couple of minutes) rather than a
// full 120s answer, and assembleQuestionMedia() already downsamples across a
// question's turns down to 8 total - capturing more here than that ceiling
// needs would just mean discarding frames later instead of not taking them.
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

// Owns the MediaStream/MediaRecorder for the recording flow. `getStream()` is
// the extension seam a future `useFaceTracking` hook (MediaPipe FaceMesh)
// would tap to compute eye-contact/posture signals from the same stream
// without refactoring the recording page.
export function useInterviewRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameBlobsRef = useRef<Blob[]>([]);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Fully separate state for the live per-turn recorder, rather than
  // reusing the batch refs above - the two modes never run in the same
  // session, but keeping them independent means nothing here can regress
  // the existing batch recording path.
  const turnRecorderRef = useRef<MediaRecorder | null>(null);
  const turnChunksRef = useRef<Blob[]>([]);
  const turnFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const turnFrameBlobsRef = useRef<Blob[]>([]);
  const turnFrameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnStartTimeRef = useRef<number>(0);

  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
        // screen) into the same mic; harmless for batch mode either way.
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

  const captureFrame = useCallback(() => {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = frameCanvasRef.current ?? document.createElement("canvas");
    frameCanvasRef.current = canvas;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob && frameBlobsRef.current.length < MAX_FRAMES) {
          frameBlobsRef.current.push(blob);
        }
      },
      "image/jpeg",
      0.7
    );
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

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    frameBlobsRef.current = [];
    startTimeRef.current = Date.now();

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    // Keep recordings well under STT provider upload limits (e.g. Groq's
    // 413 on oversized files) even at the full 120s question time limit:
    // (400kbps + 48kbps) * 120s / 8 ~= 6.7MB.
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType,
      videoBitsPerSecond: 400_000,
      audioBitsPerSecond: 48_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);

    captureFrame();
    frameIntervalRef.current = setInterval(captureFrame, FRAME_INTERVAL_MS);
  }, [captureFrame]);

  const stopRecording = useCallback((): Promise<CapturedAnswer> => {
    return new Promise((resolve, reject) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      recorder.onstop = () => {
        const videoBlob = new Blob(chunksRef.current, { type: "video/webm" });
        const durationSeconds = (Date.now() - startTimeRef.current) / 1000;
        setIsRecording(false);
        resolve({
          videoBlob,
          frameBlobs: frameBlobsRef.current,
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
    startRecording,
    stopRecording,
    startAudioTurn,
    stopAudioTurn,
    release,
    isReady,
    isRecording,
    error,
    getStream: () => streamRef.current,
  };
}
