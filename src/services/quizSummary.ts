/**
 * Quiz outcome types and summarisation.
 *
 * Shared by every activity that runs through `QuizRunner` — comprehension,
 * word drills, spelling, math facts and word problems — and kept out of the
 * component file so it can be imported by services and tests without pulling
 * React in.
 */

export interface QuizOutcome {
  correct: boolean;
  /** Milliseconds from the question being shown to the answer being submitted. */
  responseMs: number;
}

export interface QuizSummary {
  correct: number;
  total: number;
  /** Percentage correct, 0–100. */
  accuracy: number;
  /** Longest run of correct answers, not necessarily the final one. */
  bestStreak: number;
  /** Mean response time over timed answers only. */
  averageMs: number;
  outcomes: QuizOutcome[];
}

export function summarizeOutcomes(outcomes: QuizOutcome[]): QuizSummary {
  const correct = outcomes.filter((outcome) => outcome.correct).length;

  let bestStreak = 0;
  let run = 0;
  for (const outcome of outcomes) {
    run = outcome.correct ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const timed = outcomes.filter((outcome) => outcome.responseMs > 0);

  return {
    correct,
    total: outcomes.length,
    accuracy: outcomes.length === 0 ? 0 : Math.round((correct / outcomes.length) * 100),
    bestStreak,
    averageMs: timed.length === 0
      ? 0
      : Math.round(timed.reduce((sum, outcome) => sum + outcome.responseMs, 0) / timed.length),
    outcomes,
  };
}
