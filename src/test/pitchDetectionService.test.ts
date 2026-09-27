import { describe, expect, it } from 'vitest';
import { detectPitch, frequencyToMidi } from '../services/pitchDetectionService';

function sineWave(frequency: number, sampleRate = 48000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.7,
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

  it('ignores silence and very quiet background noise', () => {
    expect(detectPitch(new Float32Array(4096), 48000)).toBeNull();
    expect(detectPitch(sineWave(440).map((sample) => sample * 0.005), 48000)).toBeNull();
  });
});
