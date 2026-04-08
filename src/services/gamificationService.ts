/**
 * Gamification service.
 *
 * Scores a reading session on a 1–100 scale, weighted by word difficulty
 * (syllable count + length) and an encouraging curve so that learners always
 * see positive progress even when some words need more practice.
 */

import type { WordStatus } from '../components/WordCard';

// ---------------------------------------------------------------------------
// Syllable & difficulty helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the number of syllables in a word using a vowel-group heuristic.
 * Not perfect for all English words, but good enough for difficulty weighting.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1;

  // Count vowel groups (consecutive vowels = one syllable)
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;

  // Silent trailing 'e' (e.g. "make", "home") — subtract one syllable
  if (w.length > 2 && w.endsWith('e') && !/[aeiouy]/.test(w.charAt(w.length - 2))) {
    count = Math.max(1, count - 1);
  }

  return Math.max(1, count);
}

/**
 * Returns a difficulty tier 1–3 for a word.
 *  1 = easy   (1 syllable, short word)
 *  2 = medium (2 syllables, or long 1-syllable word)
 *  3 = hard   (3+ syllables)
 */
export function getWordDifficulty(word: string): 1 | 2 | 3 {
  const clean = word.replace(/[^a-zA-Z]/g, '');
  const syllables = countSyllables(clean);

  if (syllables >= 3) return 3;
  if (syllables === 2 || clean.length >= 7) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

export interface GamificationScore {
  /** Final gamification score, 1–100. */
  score: number;
  /** Star rating, 1–5. */
  stars: number;
  /** Short achievement label, e.g. "Bookworm". */
  label: string;
  /** Encouraging message for the user. */
  message: string;
  /** Number of hard (difficulty-3) words attempted. */
  hardWordCount: number;
  /** Number of hard words read correctly. */
  hardWordCorrect: number;
}

/**
 * Calculate the gamification score for a completed reading session.
 *
 * Algorithm:
 *  1. Weight each assessed word by its difficulty tier (1–3).
 *  2. Award partial credit proportional to its accuracy score.
 *  3. Apply an encouraging curve so that even 50 % accuracy maps to ~62.
 *  4. If a fluency score is available from Azure, blend it in (15 % weight).
 *
 * @param words       Ordered array of raw display words from the passage.
 * @param statuses    Map of word index → assessment status.
 * @param scores      Map of word index → Azure accuracy score (0–100).
 * @param fluencyScore Optional overall fluency score from Azure (0–100).
 */
export function calculateGamificationScore(
  words: string[],
  statuses: Record<number, WordStatus>,
  scores: Record<number, number>,
  fluencyScore?: number,
): GamificationScore | null {
  const assessedIndices = Object.keys(statuses).map(Number);
  if (assessedIndices.length === 0) return null;

  let weightedEarned = 0;
  let weightedMax = 0;
  let hardWordCount = 0;
  let hardWordCorrect = 0;

  for (const idx of assessedIndices) {
    const difficulty = getWordDifficulty(words[idx] ?? '');
    const accuracy = scores[idx] ?? (statuses[idx] === 'correct' ? 100 : 0);

    weightedEarned += difficulty * accuracy;
    weightedMax += difficulty * 100;

    if (difficulty === 3) {
      hardWordCount++;
      if (statuses[idx] === 'correct') hardWordCorrect++;
    }
  }

  const rawRatio = weightedMax > 0 ? weightedEarned / weightedMax : 0; // 0..1

  // Encouraging curve: 1 - (1 - rawRatio)^0.65
  // Maps: 0→0, 0.40→0.53, 0.60→0.69, 0.75→0.81, 0.90→0.93, 1→1
  const curvedRatio = 1 - Math.pow(1 - rawRatio, 0.65);

  let score: number;
  if (fluencyScore !== undefined && fluencyScore > 0) {
    score = Math.round(curvedRatio * 85 + (fluencyScore / 100) * 15);
  } else {
    score = Math.round(curvedRatio * 100);
  }

  score = Math.max(1, Math.min(100, score));

  return {
    score,
    stars: starsForScore(score),
    label: labelForScore(score),
    message: messageForScore(score, hardWordCorrect),
    hardWordCount,
    hardWordCorrect,
  };
}

// ---------------------------------------------------------------------------
// Helpers: stars / label / message
// ---------------------------------------------------------------------------

function starsForScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

function labelForScore(score: number): string {
  if (score >= 90) return 'Reading Star ⭐';
  if (score >= 75) return 'Reading Champion 🏆';
  if (score >= 60) return 'Bookworm 📚';
  if (score >= 40) return 'Word Explorer 🔍';
  return 'Getting Started 🌱';
}

function messageForScore(score: number, hardCorrect: number): string {
  const hardBonus =
    hardCorrect > 0
      ? ` You nailed ${hardCorrect} tricky word${hardCorrect > 1 ? 's' : ''}!`
      : '';

  if (score >= 90) return `Outstanding! You're a reading superstar! 🎉${hardBonus}`;
  if (score >= 75) return `Awesome reading! You should be really proud! 🏆${hardBonus}`;
  if (score >= 60) return `Well done! Your reading is really improving! 🌟${hardBonus}`;
  if (score >= 40) return `Nice work! You're building great reading skills! 📚${hardBonus}`;
  return `Great start! Every word you practise makes you stronger! 💪${hardBonus}`;
}
