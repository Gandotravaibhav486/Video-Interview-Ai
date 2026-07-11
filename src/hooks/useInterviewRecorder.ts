"use client";

import { useCallback, useRef, useState } from "react";

export interface CapturedAnswer {
  videoBlob: Blob;
  frameBlobs: Blob[];
  durationSeconds: number;
}

const MAX_FRAMES = 8;
const FRAME_INTERVAL_MS = 4000;

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoElRef.current) {
        videoElRef.current.srcObject = stream;
      }
      setIsReady(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not access camera/microphone"
      );
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

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    frameBlobsRef.current = [];
    startTimeRef.current = Date.now();

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
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
    release,
    isReady,
    isRecording,
    error,
    getStream: () => streamRef.current,
  };
}
