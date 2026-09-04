/**
 * Head-to-head practice.
 *
 * Two learners on one account, one device, taking the same questions in turn.
 * Each player answers from their own grade-appropriate question set, so a
 * first grader and a third grader can genuinely play together — the contest is
 * over *your* questions, not over who got the harder ones.
 *
 * Scoring rewards speed only after correctness, so racing and guessing never
 * beats thinking.
 */

export interface DuelPlayer {
  /** Profile id. */
  id: string;
  name: string;
  emoji: string;
}

export interface DuelAnswer {
  playerId: string;
  correct: boolean;
  responseMs: number;
}

export interface DuelScore {
  playerId: string;
  points: number;
  correct: number;
  answered: number;
  accuracy: number;
  bestStreak: number;
  averageMs: number;
}

export interface DuelResult {
  scores: DuelScore[];
  /** Winning player id, or null for a tie. */
  winnerId: string | null;
  tie: boolean;
  /** Encouraging summary line, written so the loser still reads it happily. */
  summary: string;
}

/** Points for a correct answer, before the speed bonus. */
export const DUEL_BASE_POINTS = 10;
/** Maximum extra points for answering quickly. */
export const DUEL_MAX_SPEED_BONUS = 5;
/** Answering at or under this many ms earns the full speed bonus. */
export const DUEL_FAST_MS = 2000;
/** Beyond this, no speed bonus at all. */
export const DUEL_SLOW_MS = 10_000;

/**
 * Points for one answer.
 *
 * A wrong answer always scores zero regardless of speed — otherwise the
 * winning strategy is to slam a number in as fast as possible.
 */
export function pointsForAnswer(correct: boolean, responseMs: number): number {
  if (!correct) return 0;
  if (!Number.isFinite(responseMs) || responseMs <= DUEL_FAST_MS) {
    return DUEL_BASE_POINTS + DUEL_MAX_SPEED_BONUS;
  }
  if (responseMs >= DUEL_SLOW_MS) return DUEL_BASE_POINTS;

  const span = DUEL_SLOW_MS - DUEL_FAST_MS;
  const remaining = DUEL_SLOW_MS - responseMs;
  return DUEL_BASE_POINTS + Math.round((remaining / span) * DUEL_MAX_SPEED_BONUS);
}

function scoreFor(playerId: string, answers: DuelAnswer[]): DuelScore {
  const own = answers.filter((answer) => answer.playerId === playerId);
  const correct = own.filter((answer) => answer.correct).length;

  let bestStreak = 0;
  let run = 0;
  for (const answer of own) {
    run = answer.correct ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const timed = own.filter((answer) => Number.isFinite(answer.responseMs) && answer.responseMs > 0);

  return {
    playerId,
    points: own.reduce((sum, answer) => sum + pointsForAnswer(answer.correct, answer.responseMs), 0),
    correct,
    answered: own.length,
    accuracy: own.length === 0 ? 0 : Math.round((correct / own.length) * 100),
    bestStreak,
    averageMs: timed.length === 0
      ? 0
      : Math.round(timed.reduce((sum, answer) => sum + answer.responseMs, 0) / timed.length),
  };
}

/**
 * Score a finished duel.
 *
 * Ties are genuine ties — no tie-break on speed — because with two siblings a
 * draw is the single most useful outcome the game can produce.
 */
export function scoreDuel(players: DuelPlayer[], answers: DuelAnswer[]): DuelResult {
  const scores = players.map((player) => scoreFor(player.id, answers));
  const top = scores.reduce((best, score) => (score.points > best.points ? score : best), scores[0]);

  const leaders = scores.filter((score) => top && score.points === top.points);
  const tie = leaders.length !== 1;
  const winnerId = tie ? null : leaders[0].playerId;

  const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? 'Player';

  let summary: string;
  if (scores.length === 0 || scores.every((score) => score.answered === 0)) {
    summary = 'No answers yet — start the round!';
  } else if (tie) {
    summary = `It's a tie! ${scores.map((s) => `${nameOf(s.playerId)} ${s.points}`).join(' · ')}`;
  } else {
    const runnerUp = scores
      .filter((score) => score.playerId !== winnerId)
      .reduce((best, score) => (score.points > best.points ? score : best), { points: -1 } as DuelScore);
    const margin = top.points - (runnerUp.points < 0 ? 0 : runnerUp.points);
    summary = margin <= 5
      ? `${nameOf(winnerId!)} wins by a whisker — great round from everyone!`
      : `${nameOf(winnerId!)} takes it with ${top.points} points!`;
  }

  return { scores, winnerId, tie, summary };
}

/**
 * Whose turn it is.
 *
 * Turns alternate strictly, so a faster player cannot run away with the round.
 */
export function currentTurn(players: DuelPlayer[], answerCount: number): DuelPlayer | null {
  if (players.length === 0) return null;
  return players[answerCount % players.length];
}

/** True when every player has answered `roundsPerPlayer` questions. */
export function isDuelComplete(players: DuelPlayer[], answers: DuelAnswer[], roundsPerPlayer: number): boolean {
  if (players.length === 0 || roundsPerPlayer <= 0) return true;
  return players.every(
    (player) => answers.filter((answer) => answer.playerId === player.id).length >= roundsPerPlayer,
  );
}
