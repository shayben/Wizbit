/**
 * Trophy definitions and award logic.
 *
 * Trophies are awarded after a reading session based on cumulative stats.
 * Each trophy can only be earned once per user.
 */

import type { UserProgress } from './progressService';

export interface Trophy {
  id: string;
  emoji: string;
  name: string;
  description: string;
}

export const ALL_TROPHIES: Trophy[] = [
  { id: 'first_read',        emoji: '📖', name: 'First Read',         description: 'Complete your first reading session' },
  { id: 'five_sessions',     emoji: '🔖', name: 'Bookmarked',         description: 'Complete 5 reading sessions' },
  { id: 'ten_sessions',      emoji: '📚', name: 'Bookworm',           description: 'Complete 10 reading sessions' },
  { id: 'twenty_five_sessions', emoji: '🦉', name: 'Wise Reader',     description: 'Complete 25 reading sessions' },
  { id: 'fifty_sessions',    emoji: '🏛️', name: 'Library Hero',       description: 'Complete 50 reading sessions' },
  { id: 'score_50',          emoji: '🌱', name: 'Growing Strong',     description: 'Score 50 or higher in a session' },
  { id: 'score_75',          emoji: '⭐', name: 'Rising Star',        description: 'Score 75 or higher in a session' },
  { id: 'score_90',          emoji: '🏆', name: 'Champion Reader',    description: 'Score 90 or higher in a session' },
  { id: 'score_100',         emoji: '💎', name: 'Perfect Read',       description: 'Score 100 in a session' },
  { id: 'five_stars',        emoji: '🌟', name: 'Five Star Reader',   description: 'Earn 5 stars in a single session' },
  { id: 'hard_words_3',      emoji: '💪', name: 'Word Warrior',       description: 'Correctly read 3+ tricky words in one session' },
  { id: 'hard_words_10',     emoji: '🧠', name: 'Vocabulary Master',  description: 'Correctly read 10+ tricky words in one session' },
  { id: 'practice_cleared',  emoji: '✅', name: 'Practice Makes Perfect', description: 'Remove a word from your practice list by reading it correctly' },
  { id: 'streak_3',          emoji: '🔥', name: 'On Fire',            description: 'Read on 3 different days' },
  { id: 'streak_7',          emoji: '⚡', name: 'Lightning Streak',   description: 'Read on 7 different days' },
];

const TROPHY_MAP = new Map(ALL_TROPHIES.map((t) => [t.id, t]));

export function getTrophy(id: string): Trophy | undefined {
  return TROPHY_MAP.get(id);
}

/**
 * Returns the IDs of trophies newly earned after this session.
 * Already-earned trophies (from `earnedIds`) are excluded.
 */
export function computeNewTrophies(
  progress: UserProgress,
  earnedIds: Set<string>,
): string[] {
  const newIds: string[] = [];

  const check = (id: string, condition: boolean) => {
    if (condition && !earnedIds.has(id)) newIds.push(id);
  };

  const sessionCount = progress.sessionCount;
  const latestSession = progress.latestSession;

  // Session count milestones
  check('first_read',           sessionCount >= 1);
  check('five_sessions',        sessionCount >= 5);
  check('ten_sessions',         sessionCount >= 10);
  check('twenty_five_sessions', sessionCount >= 25);
  check('fifty_sessions',       sessionCount >= 50);

  // Score-based (latest session)
  if (latestSession) {
    check('score_50',    latestSession.score >= 50);
    check('score_75',    latestSession.score >= 75);
    check('score_90',    latestSession.score >= 90);
    check('score_100',   latestSession.score === 100);
    check('five_stars',  latestSession.stars === 5);
    check('hard_words_3',  latestSession.hardWordCorrect >= 3);
    check('hard_words_10', latestSession.hardWordCorrect >= 10);
  }

  // Unique reading days
  const uniqueDays = new Set(progress.sessionDates).size;
  check('streak_3', uniqueDays >= 3);
  check('streak_7', uniqueDays >= 7);

  // Practice word cleared (tracked externally; passed via progress flag)
  if (progress.practiceClearedCount > 0) {
    check('practice_cleared', true);
  }

  return newIds;
}
