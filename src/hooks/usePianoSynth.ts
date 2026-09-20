import { useCallback, useEffect, useRef } from 'react';

export function usePianoSynth() {
  const contextRef = useRef<AudioContext | null>(null);

  const playNote = useCallback((midi: number, velocity = 0.8) => {
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (context.state === 'suspended') void context.resume();

    const now = context.currentTime;
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const gain = context.createGain();
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();

    fundamental.type = 'triangle';
    fundamental.frequency.value = frequency;
    overtone.type = 'sine';
    overtone.frequency.value = frequency * 2;

    gain.gain.setValueAtTime(Math.max(0.001, velocity * 0.32), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(context.destination);
    fundamental.start(now);
    overtone.start(now);
    fundamental.stop(now + 1.2);
    overtone.stop(now + 0.8);
  }, []);

  useEffect(() => () => {
    if (contextRef.current) void contextRef.current.close();
  }, []);

  return playNote;
}
