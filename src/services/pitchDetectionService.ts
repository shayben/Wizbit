const DEFAULT_MIN_FREQUENCY = 65;
const DEFAULT_MAX_FREQUENCY = 1100;
const SILENCE_THRESHOLD = 0.003;
const YIN_THRESHOLD = 0.2;

export function frequencyToMidi(frequency: number) {
  return Math.round(69 + (12 * Math.log2(frequency / 440)));
}

export function measureSignalLevel(samples: Float32Array) {
  if (samples.length === 0) return 0;

  let squareSum = 0;
  for (const sample of samples) squareSum += sample * sample;
  return Math.sqrt(squareSum / samples.length);
}

export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  minFrequency = DEFAULT_MIN_FREQUENCY,
  maxFrequency = DEFAULT_MAX_FREQUENCY,
): number | null {
  if (samples.length < 4 || sampleRate <= 0) return null;

  if (measureSignalLevel(samples) < SILENCE_THRESHOLD) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(
    Math.floor(sampleRate / minFrequency),
    Math.floor(samples.length / 2),
  );
  if (minLag >= maxLag) return null;

  const difference = new Float32Array(maxLag + 1);
  const comparisonLength = samples.length - maxLag;

  for (let lag = 1; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = samples[index] - samples[index + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let runningSum = 0;
  difference[0] = 1;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    runningSum += difference[lag];
    difference[lag] = runningSum === 0 ? 1 : (difference[lag] * lag) / runningSum;
  }

  let bestLag = -1;
  for (let lag = minLag; lag < maxLag; lag += 1) {
    if (difference[lag] >= YIN_THRESHOLD) continue;
    while (lag + 1 <= maxLag && difference[lag + 1] < difference[lag]) lag += 1;
    bestLag = lag;
    break;
  }

  if (bestLag < 0) return null;

  const previous = difference[bestLag - 1] ?? difference[bestLag];
  const current = difference[bestLag];
  const next = difference[bestLag + 1] ?? difference[bestLag];
  const denominator = (2 * current) - previous - next;
  const adjustment = denominator === 0 ? 0 : (next - previous) / (2 * denominator);
  const refinedLag = bestLag + adjustment;

  return refinedLag > 0 ? sampleRate / refinedLag : null;
}
