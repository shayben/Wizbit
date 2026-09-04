import { describe, it, expect } from 'vitest';
import {
  MIN_SECONDS_FOR_FLUENCY,
  MIN_WORDS_FOR_FLUENCY,
  WCPM_TARGETS,
  benchmarkFluency,
  computeFluency,
  fluencyTrend,
} from '../services/fluencyService';

/** Build `count` assessed words, the first `correctCount` of them correct. */
function sample(count: number, correctCount: number, secondsPerWord = 0.5) {
  const statuses: Record<number, string> = {};
  const timings: Record<number, { offsetSec: number; durationSec: number }> = {};
  for (let i = 0; i < count; i += 1) {
    statuses[i] = i < correctCount ? 'correct' : 'mispronounced';
    timings[i] = { offsetSec: i * secondsPerWord, durationSec: secondsPerWord };
  }
  return { statuses, timings };
}

describe('computeFluency', () => {
  it('computes words correct per minute over the spoken span', () => {
    // 60 words at 0.5s each = 30s of reading; 30 correct → 60 WCPM.
    const { statuses, timings } = sample(60, 30);
    const result = computeFluency(statuses, timings);
    expect(result).not.toBeNull();
    expect(result!.wcpm).toBe(60);
    expect(result!.correct).toBe(30);
    expect(result!.attempted).toBe(60);
    expect(result!.accuracy).toBe(50);
    expect(result!.elapsedSec).toBe(30);
  });

  it('ignores silence before the first word', () => {
    const { statuses, timings } = sample(40, 40);
    for (const key of Object.keys(timings)) {
      timings[Number(key)].offsetSec += 90; // long pause before reading started
    }
    expect(computeFluency(statuses, timings)!.elapsedSec).toBe(20);
  });

  it('returns null for a sample with too few words', () => {
    const { statuses, timings } = sample(MIN_WORDS_FOR_FLUENCY - 1, 5);
    expect(computeFluency(statuses, timings)).toBeNull();
  });

  it('returns null when the passage was read too briefly to time', () => {
    const { statuses, timings } = sample(40, 40, 0.05); // ~2s total
    expect(computeFluency(statuses, timings)).toBeNull();
  });

  it('returns null when no timings were captured', () => {
    const { statuses } = sample(40, 40);
    expect(computeFluency(statuses, {})).toBeNull();
  });

  it('counts only fully correct words, not partial credit', () => {
    const statuses: Record<number, string> = {};
    const timings: Record<number, { offsetSec: number; durationSec: number }> = {};
    for (let i = 0; i < 60; i += 1) {
      statuses[i] = i % 2 === 0 ? 'correct' : 'average';
      timings[i] = { offsetSec: i * 0.5, durationSec: 0.5 };
    }
    expect(computeFluency(statuses, timings)!.correct).toBe(30);
  });

  it('honours caller-supplied thresholds', () => {
    const { statuses, timings } = sample(10, 10, 2);
    expect(computeFluency(statuses, timings, { minWords: 5, minSeconds: MIN_SECONDS_FOR_FLUENCY }))
      .not.toBeNull();
  });
});

describe('benchmarkFluency', () => {
  it('labels a first grader at the grade target as on track', () => {
    expect(benchmarkFluency(WCPM_TARGETS['1'], '1').band).toBe('on-track');
  });

  it('labels a clearly faster reader as above grade level', () => {
    expect(benchmarkFluency(Math.round(WCPM_TARGETS['3'] * 1.3), '3').band).toBe('above');
  });

  it('separates approaching from building', () => {
    expect(benchmarkFluency(Math.round(WCPM_TARGETS['3'] * 0.75), '3').band).toBe('approaching');
    expect(benchmarkFluency(Math.round(WCPM_TARGETS['3'] * 0.4), '3').band).toBe('building');
  });

  it('judges the same rate differently across grades', () => {
    expect(benchmarkFluency(60, '1').band).toBe('on-track');
    expect(benchmarkFluency(60, '5').band).toBe('building');
  });

  it('always returns encouraging, non-empty wording', () => {
    for (const grade of ['K', '1', '2', '3', '4', '5'] as const) {
      const result = benchmarkFluency(10, grade);
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.target).toBe(WCPM_TARGETS[grade]);
    }
  });
});

describe('fluencyTrend', () => {
  it('reports improvement as a positive delta', () => {
    expect(fluencyTrend([40, 40, 60, 60])).toBe(20);
  });

  it('reports a slowdown as a negative delta', () => {
    expect(fluencyTrend([80, 80, 60, 60])).toBe(-20);
  });

  it('returns zero when there is not enough history', () => {
    expect(fluencyTrend([])).toBe(0);
    expect(fluencyTrend([90])).toBe(0);
  });
});
