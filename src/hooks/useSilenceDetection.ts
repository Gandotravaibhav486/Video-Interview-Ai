"use client";

import { useCallback, useRef } from "react";

// Detects end-of-speech from the live mic stream via a simple RMS-over-
// threshold check on a Web Audio AnalyserNode - no VAD library, since a
// fixed silence duration is enough to feel natural for interview pacing
// (a beat of silence is a normal part of someone finishing an answer).
const SILENCE_THRESHOLD = 0.02; // RMS amplitude, roughly "quiet room" level
const SILENCE_DURATION_MS = 2500;
const CHECK_INTERVAL_MS = 100;

export function useSilenceDetection() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    silenceStartRef.current = null;
  }, []);

  /**
   * Starts watching `stream` for end-of-speech and calls `onSilence` once,
   * the first time RMS stays under threshold for SILENCE_DURATION_MS. Call
   * `stop()` when the turn ends (via button or via this callback) - it does
   * not call itself.
   */
  const start = useCallback(
    (stream: MediaStream, onSilence: () => void) => {
      stop();

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      silenceStartRef.current = null;

      const buffer = new Float32Array(analyser.fftSize);
      let fired = false;

      checkIntervalRef.current = setInterval(() => {
        if (fired) return;
        analyser.getFloatTimeDomainData(buffer);

        let sumSquares = 0;
        for (const sample of buffer) sumSquares += sample * sample;
        const rms = Math.sqrt(sumSquares / buffer.length);

        const now = Date.now();
        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current >= SILENCE_DURATION_MS) {
            fired = true;
            onSilence();
          }
        } else {
          silenceStartRef.current = null;
        }
      }, CHECK_INTERVAL_MS);
    },
    [stop]
  );

  return { start, stop };
}
