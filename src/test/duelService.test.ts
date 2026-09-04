import { describe, it, expect } from 'vitest';
import {
  DUEL_BASE_POINTS,
  DUEL_FAST_MS,
  DUEL_MAX_SPEED_BONUS,
  DUEL_SLOW_MS,
  currentTurn,
  isDuelComplete,
  pointsForAnswer,
  scoreDuel,
  type DuelAnswer,
  type DuelPlayer,
} from '../services/duelService';

const players: DuelPlayer[] = [
  { id: 'a', name: 'Maya', emoji: '🦊' },
  { id: 'b', name: 'Ben', emoji: '🐨' },
];

const answer = (playerId: string, correct: boolean, responseMs = 3000): DuelAnswer =>
  ({ playerId, correct, responseMs });

describe('pointsForAnswer', () => {
  it('scores zero for a wrong answer however fast', () => {
    expect(pointsForAnswer(false, 100)).toBe(0);
  });

  it('gives the full speed bonus for a quick correct answer', () => {
    expect(pointsForAnswer(true, DUEL_FAST_MS)).toBe(DUEL_BASE_POINTS + DUEL_MAX_SPEED_BONUS);
  });

  it('gives base points for a slow correct answer', () => {
    expect(pointsForAnswer(true, DUEL_SLOW_MS + 5000)).toBe(DUEL_BASE_POINTS);
  });

  it('scales the bonus in between', () => {
    const mid = pointsForAnswer(true, (DUEL_FAST_MS + DUEL_SLOW_MS) / 2);
    expect(mid).toBeGreaterThan(DUEL_BASE_POINTS);
    expect(mid).toBeLessThan(DUEL_BASE_POINTS + DUEL_MAX_SPEED_BONUS);
  });

  it('never lets speed beat correctness', () => {
    expect(pointsForAnswer(false, 1)).toBeLessThan(pointsForAnswer(true, DUEL_SLOW_MS * 2));
  });

  it('handles a missing response time', () => {
    expect(pointsForAnswer(true, Number.NaN)).toBe(DUEL_BASE_POINTS + DUEL_MAX_SPEED_BONUS);
  });
});

describe('scoreDuel', () => {
  it('declares the higher scorer the winner', () => {
    const result = scoreDuel(players, [
      answer('a', true, 1000), answer('b', false),
      answer('a', true, 1000), answer('b', true, 9000),
    ]);
    expect(result.winnerId).toBe('a');
    expect(result.tie).toBe(false);
    expect(result.summary).toContain('Maya');
  });

  it('reports a genuine tie without a speed tie-break', () => {
    const result = scoreDuel(players, [answer('a', true, 1000), answer('b', true, 1000)]);
    expect(result.tie).toBe(true);
    expect(result.winnerId).toBeNull();
    expect(result.summary).toContain('tie');
  });

  it('computes per-player accuracy and streaks', () => {
    const result = scoreDuel(players, [
      answer('a', true), answer('a', true), answer('a', false), answer('a', true),
    ]);
    const maya = result.scores.find((s) => s.playerId === 'a')!;
    expect(maya.answered).toBe(4);
    expect(maya.correct).toBe(3);
    expect(maya.accuracy).toBe(75);
    expect(maya.bestStreak).toBe(2);
  });

  it('softens the summary for a close finish', () => {
    const result = scoreDuel(players, [answer('a', true, 1000), answer('b', true, 9500)]);
    expect(result.summary).toContain('whisker');
  });

  it('handles a round with no answers yet', () => {
    const result = scoreDuel(players, []);
    expect(result.summary).toContain('No answers yet');
    expect(result.winnerId).toBeNull();
  });

  it('gives a player with no answers a zero score rather than omitting them', () => {
    const result = scoreDuel(players, [answer('a', true)]);
    expect(result.scores).toHaveLength(2);
    expect(result.scores.find((s) => s.playerId === 'b')).toMatchObject({ points: 0, answered: 0 });
  });

  it('ignores answers from a player not in the duel', () => {
    const result = scoreDuel(players, [answer('ghost', true), answer('a', true)]);
    expect(result.scores.map((s) => s.playerId)).toEqual(['a', 'b']);
  });

  it('averages only the timed answers', () => {
    const result = scoreDuel(players, [answer('a', true, 2000), answer('a', true, 4000)]);
    expect(result.scores[0].averageMs).toBe(3000);
  });
});

describe('currentTurn', () => {
  it('alternates strictly between players', () => {
    expect(currentTurn(players, 0)?.id).toBe('a');
    expect(currentTurn(players, 1)?.id).toBe('b');
    expect(currentTurn(players, 2)?.id).toBe('a');
  });

  it('returns null with no players', () => {
    expect(currentTurn([], 0)).toBeNull();
  });
});

describe('isDuelComplete', () => {
  it('is incomplete until every player has had their turns', () => {
    const answers = [answer('a', true), answer('a', true)];
    expect(isDuelComplete(players, answers, 2)).toBe(false);
  });

  it('is complete once both players finish', () => {
    const answers = [answer('a', true), answer('b', true), answer('a', true), answer('b', true)];
    expect(isDuelComplete(players, answers, 2)).toBe(true);
  });

  it('treats a zero-round duel as already complete', () => {
    expect(isDuelComplete(players, [], 0)).toBe(true);
  });
});
