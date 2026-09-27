import { describe, expect, it } from 'vitest';
import {
  detectPitch,
  frequencyToMidi,
  measureSignalLevel,
} from '../services/pitchDetectionService';

function sineWave(frequency: number, sampleRate = 48000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.7,
  );
}

function pianoLikeWave(frequency: number, sampleRate = 48000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) => {
      const phase = (2 * Math.PI * frequency * index) / sampleRate;
      return (
        (Math.sin(phase) * 0.006)
        + (Math.sin(phase * 2) * 0.003)
        + (Math.sin(phase * 3) * 0.0015)
      );
    },
  );
}

describe('pitchDetectionService', () => {
  it('converts concert A to MIDI note 69', () => {
    expect(frequencyToMidi(440)).toBe(69);
  });

  it('detects a played A4 frequency', () => {
    const pitch = detectPitch(sineWave(440), 48000);

    expect(pitch).not.toBeNull();
    expect(pitch).toBeCloseTo(440, 0);
    expect(frequencyToMidi(pitch ?? 0)).toBe(69);
  });

  it('detects a low piano note', () => {
    const pitch = detectPitch(sineWave(130.81), 48000);

    expect(pitch).not.toBeNull();
    expect(frequencyToMidi(pitch ?? 0)).toBe(48);
  });

  it('detects a quiet piano-like signal with strong harmonics', () => {
    const pitch = detectPitch(pianoLikeWave(261.63), 48000);

    expect(pitch).not.toBeNull();
    expect(frequencyToMidi(pitch ?? 0)).toBe(60);
  });

  it('measures microphone signal level', () => {
    expect(measureSignalLevel(sineWave(440))).toBeGreaterThan(0.4);
    expect(measureSignalLevel(new Float32Array(4096))).toBe(0);
  });

  it('ignores silence and very quiet background noise', () => {
    expect(detectPitch(new Float32Array(4096), 48000)).toBeNull();
    expect(detectPitch(sineWave(440).map((sample) => sample * 0.002), 48000)).toBeNull();
  });
});
