import { useCallback, useEffect, useRef, useState } from 'react';
import { detectPitch, frequencyToMidi } from '../services/pitchDetectionService';

type MicrophoneStatus = 'idle' | 'requesting' | 'listening' | 'unsupported' | 'error';

const MIN_MIDI_NOTE = 36;
const MAX_MIDI_NOTE = 84;
const REQUIRED_STABLE_FRAMES = 2;
const SILENT_FRAMES_TO_RELEASE = 3;
const ANALYSIS_INTERVAL_MS = 70;

export function useMicrophonePitch(onNoteOn: (note: number, velocity: number) => void) {
  const isSupported = typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof AudioContext !== 'undefined';
  const [status, setStatus] = useState<MicrophoneStatus>(isSupported ? 'idle' : 'unsupported');
  const [error, setError] = useState<string | null>(
    isSupported ? null : 'Microphone note detection is not supported in this browser.',
  );
  const [detectedMidi, setDetectedMidi] = useState<number | null>(null);
  const callbackRef = useRef(onNoteOn);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastAnalysisRef = useRef(0);
  const candidateRef = useRef<number | null>(null);
  const stableFramesRef = useRef(0);
  const activeNoteRef = useRef<number | null>(null);
  const silentFramesRef = useRef(0);
  const suppressUntilRef = useRef(0);
  const generationRef = useRef(0);

  useEffect(() => {
    callbackRef.current = onNoteOn;
  }, [onNoteOn]);

  const resetDetection = useCallback(() => {
    candidateRef.current = null;
    stableFramesRef.current = 0;
    activeNoteRef.current = null;
    silentFramesRef.current = 0;
  }, []);

  const releaseResources = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (contextRef.current) void contextRef.current.close();
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    resetDetection();
  }, [resetDetection]);

  const stop = useCallback(() => {
    releaseResources();
    setDetectedMidi(null);
    setError(null);
    setStatus(isSupported ? 'idle' : 'unsupported');
  }, [isSupported, releaseResources]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setStatus('unsupported');
      setError('Microphone note detection is not supported in this browser.');
      return;
    }

    releaseResources();
    const generation = generationRef.current;
    setStatus('requesting');
    setError(null);
    setDetectedMidi(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const context = new AudioContext();
      if (context.state === 'suspended') await context.resume();
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        return;
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      contextRef.current = context;
      sourceRef.current = source;
      analyserRef.current = analyser;
      setStatus('listening');

      const samples = new Float32Array(analyser.fftSize);
      const analyse = (timestamp: number) => {
        frameRef.current = requestAnimationFrame(analyse);
        if (timestamp - lastAnalysisRef.current < ANALYSIS_INTERVAL_MS) return;
        lastAnalysisRef.current = timestamp;

        if (timestamp < suppressUntilRef.current) {
          resetDetection();
          setDetectedMidi(null);
          return;
        }

        analyser.getFloatTimeDomainData(samples);
        const frequency = detectPitch(samples, context.sampleRate);
        const midi = frequency === null ? null : frequencyToMidi(frequency);
        const playableMidi = midi !== null && midi >= MIN_MIDI_NOTE && midi <= MAX_MIDI_NOTE
          ? midi
          : null;

        if (playableMidi === null) {
          silentFramesRef.current += 1;
          candidateRef.current = null;
          stableFramesRef.current = 0;
          if (silentFramesRef.current >= SILENT_FRAMES_TO_RELEASE) {
            activeNoteRef.current = null;
            setDetectedMidi(null);
          }
          return;
        }

        silentFramesRef.current = 0;
        if (candidateRef.current === playableMidi) {
          stableFramesRef.current += 1;
        } else {
          candidateRef.current = playableMidi;
          stableFramesRef.current = 1;
        }

        if (
          stableFramesRef.current >= REQUIRED_STABLE_FRAMES
          && activeNoteRef.current !== playableMidi
        ) {
          activeNoteRef.current = playableMidi;
          setDetectedMidi(playableMidi);
          callbackRef.current(playableMidi, 0.8);
        }
      };

      frameRef.current = requestAnimationFrame(analyse);
    } catch (microphoneError) {
      if (generation !== generationRef.current) return;
      releaseResources();
      setStatus('error');
      setError(
        microphoneError instanceof DOMException && microphoneError.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in your browser settings and try again.'
          : 'Could not start microphone note detection.',
      );
    }
  }, [isSupported, releaseResources, resetDetection]);

  const suppress = useCallback((durationMs = 900) => {
    suppressUntilRef.current = performance.now() + durationMs;
  }, []);

  useEffect(() => releaseResources, [releaseResources]);

  return {
    status,
    error,
    detectedMidi,
    isSupported,
    start,
    stop,
    suppress,
  };
}
