/**
 * Reading fluency (words correct per minute).
 *
 * WCPM is the standard elementary progress measure: how many words the child
 * read *correctly* per minute of connected text. Azure already hands us a
 * per-word status and a per-word timing offset, so the measure is derived from
 * data the reading session has collected all along.
 *
 * Benchmarks are spring-of-year oral reading fluency norms rounded to tidy
 * numbers; they are used to label a result, never to gate anything.
 */

import type { GradeCode } from '../types/grade';

export interface WordTimingLike {
  offsetSec: number;
  durationSec: number;
}

export interface FluencyResult {
  /** Words correct per minute, rounded. */
  wcpm: number;
  /** Total words the child attempted (assessed by the recogniser). */
  attempted: number;
  /** Of those, how many were read correctly. */
  correct: number;
  /** Seconds of connected reading used for the rate. */
  elapsedSec: number;
  /** Accuracy as a percentage of attempted words, 0–100. */
  accuracy: number;
}

export interface FluencyBenchmark {
  grade: GradeCode;
  /** Target WCPM for the end of this grade. */
  target: number;
  /** Band the child's rate falls into. */
  band: 'building' | 'approaching' | 'on-track' | 'above';
  label: string;
  message: string;
}

/** End-of-year WCPM targets by grade. */
export const WCPM_TARGETS: Record<GradeCode, number> = {
  K: 25, '1': 60, '2': 100, '3': 112, '4': 133, '5': 146,
};

/**
 * A rate needs enough text and enough time to mean anything. Below these
 * thresholds {@link computeFluency} returns null rather than a noisy number.
 */
export const MIN_WORDS_FOR_FLUENCY = 20;
export const MIN_SECONDS_FOR_FLUENCY = 10;

/** Statuses that count as a correctly read word. */
const CORRECT_STATUSES = new Set(['correct']);

/**
 * Derive WCPM from per-word statuses and timings.
 *
 * Elapsed time spans the first attempted word to the end of the last one, so
 * pauses before the child starts speaking do not depress the rate.
 *
 * @returns null when the sample is too short to be meaningful.
 */
export function computeFluency(
  statuses: Record<number, string>,
  timings: Record<number, WordTimingLike>,
  now: { minWords?: number; minSeconds?: number } = {},
): FluencyResult | null {
  const minWords = now.minWords ?? MIN_WORDS_FOR_FLUENCY;
  const minSeconds = now.minSeconds ?? MIN_SECONDS_FOR_FLUENCY;

  const indices = Object.keys(statuses).map(Number).filter((i) => Number.isFinite(i));
  const attempted = indices.length;
  if (attempted < minWords) return null;

  const correct = indices.filter((i) => CORRECT_STATUSES.has(statuses[i])).length;

  const spans = indices
    .map((i) => timings[i])
    .filter((t): t is WordTimingLike => Boolean(t) && Number.isFinite(t.offsetSec));

  if (spans.length === 0) return null;

  const start = Math.min(...spans.map((t) => t.offsetSec));
  const end = Math.max(...spans.map((t) => t.offsetSec + (Number.isFinite(t.durationSec) ? t.durationSec : 0)));
  const elapsedSec = end - start;
  if (!Number.isFinite(elapsedSec) || elapsedSec < minSeconds) return null;

  return {
    wcpm: Math.round((correct / elapsedSec) * 60),
    attempted,
    correct,
    elapsedSec: Math.round(elapsedSec),
    accuracy: Math.round((correct / attempted) * 100),
  };
}

/** Compare a rate against the grade target and produce child-facing wording. */
export function benchmarkFluency(wcpm: number, grade: GradeCode): FluencyBenchmark {
  const target = WCPM_TARGETS[grade];
  const ratio = target > 0 ? wcpm / target : 0;

  let band: FluencyBenchmark['band'];
  let label: string;
  let message: string;

  if (ratio >= 1.15) {
    band = 'above';
    label = 'Above grade level';
    message = 'Your reading is quick and smooth — try a harder book!';
  } else if (ratio >= 0.9) {
    band = 'on-track';
    label = 'On track';
    message = 'Right where a strong reader should be. Keep it up!';
  } else if (ratio >= 0.7) {
    band = 'approaching';
    label = 'Almost there';
    message = 'Getting smoother! Re-reading a favourite page builds speed.';
  } else {
    band = 'building';
    label = 'Building up';
    message = 'Every read makes it easier. Slow and steady wins.';
  }

  return { grade, target, band, label, message };
}

/**
 * Trend across recent sessions: the change in WCPM from the first half of the
 * window to the second half. Positive means the child is speeding up.
 */
export function fluencyTrend(recentWcpm: number[]): number {
  if (recentWcpm.length < 2) return 0;
  const mid = Math.floor(recentWcpm.length / 2);
  const older = recentWcpm.slice(0, mid);
  const newer = recentWcpm.slice(mid);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(mean(newer) - mean(older));
}
