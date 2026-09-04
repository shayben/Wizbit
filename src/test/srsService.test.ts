import { describe, it, expect } from 'vitest';
import {
  BOX_INTERVAL_HOURS,
  MASTERY_BOX,
  MAX_BOX,
  buildReviewQueue,
  createSrsItem,
  isSrsDue,
  isSrsMastered,
  parseSrsCollection,
  recordSrsReview,
  reviewSrsItem,
  selectDueItems,
  summarizeSrs,
  type SrsCollection,
} from '../services/srsService';

const NOW = new Date('2026-03-01T10:00:00.000Z');
const hoursLater = (h: number) => new Date(NOW.getTime() + h * 3600_000);

describe('createSrsItem', () => {
  it('starts in box 0 and is immediately due', () => {
    const item = createSrsItem('cat', NOW);
    expect(item.box).toBe(0);
    expect(item.reps).toBe(0);
    expect(item.lastReviewedAt).toBeNull();
    expect(isSrsDue(item, NOW)).toBe(true);
  });
});

describe('reviewSrsItem', () => {
  it('promotes one box on a correct answer and schedules further out', () => {
    const reviewed = reviewSrsItem(createSrsItem('cat', NOW), true, NOW);
    expect(reviewed.box).toBe(1);
    expect(reviewed.streak).toBe(1);
    expect(reviewed.reps).toBe(1);
    expect(new Date(reviewed.dueAt).getTime()).toBe(
      NOW.getTime() + BOX_INTERVAL_HOURS[1] * 3600_000,
    );
  });

  it('caps promotion at the highest box', () => {
    let item = createSrsItem('cat', NOW);
    for (let i = 0; i < MAX_BOX + 5; i += 1) item = reviewSrsItem(item, true, NOW);
    expect(item.box).toBe(MAX_BOX);
  });

  it('drops a missed item to box 0 so it returns in the same session', () => {
    const promoted = reviewSrsItem(reviewSrsItem(createSrsItem('cat', NOW), true, NOW), true, NOW);
    const missed = reviewSrsItem(promoted, false, NOW);
    expect(missed.box).toBe(0);
    expect(missed.streak).toBe(0);
    expect(isSrsDue(missed, NOW)).toBe(true);
  });

  it('counts a lapse only when a promoted item is missed', () => {
    const freshMiss = reviewSrsItem(createSrsItem('cat', NOW), false, NOW);
    expect(freshMiss.lapses).toBe(0);

    const promoted = reviewSrsItem(createSrsItem('dog', NOW), true, NOW);
    expect(reviewSrsItem(promoted, false, NOW).lapses).toBe(1);
  });

  it('does not mutate the input item', () => {
    const item = createSrsItem('cat', NOW);
    reviewSrsItem(item, true, NOW);
    expect(item.box).toBe(0);
  });
});

describe('recordSrsReview', () => {
  it('creates tracking state for an unknown id', () => {
    const next = recordSrsReview({}, 'new-word', true, NOW);
    expect(next['new-word'].box).toBe(1);
  });

  it('leaves other entries untouched', () => {
    const base: SrsCollection = { a: createSrsItem('a', NOW) };
    const next = recordSrsReview(base, 'b', false, NOW);
    expect(next.a).toBe(base.a);
    expect(next.b).toBeDefined();
  });
});

describe('isSrsMastered', () => {
  it('requires reaching the mastery box', () => {
    let item = createSrsItem('cat', NOW);
    for (let i = 0; i < MASTERY_BOX - 1; i += 1) item = reviewSrsItem(item, true, NOW);
    expect(isSrsMastered(item)).toBe(false);
    expect(isSrsMastered(reviewSrsItem(item, true, NOW))).toBe(true);
  });
});

describe('selectDueItems', () => {
  it('returns only items whose interval has elapsed', () => {
    const collection: SrsCollection = {
      due: reviewSrsItem(createSrsItem('due', NOW), true, NOW),      // +20h
      later: reviewSrsItem(reviewSrsItem(createSrsItem('later', NOW), true, NOW), true, NOW), // +44h
    };
    const ids = selectDueItems(collection, hoursLater(24)).map((i) => i.id);
    expect(ids).toEqual(['due']);
  });

  it('orders by most overdue, then by lapse count', () => {
    const collection: SrsCollection = {
      old: { ...createSrsItem('old', NOW), dueAt: hoursLater(-5).toISOString() },
      recent: { ...createSrsItem('recent', NOW), dueAt: hoursLater(-1).toISOString() },
      shaky: { ...createSrsItem('shaky', NOW), dueAt: hoursLater(-1).toISOString(), lapses: 3 },
    };
    expect(selectDueItems(collection, NOW).map((i) => i.id)).toEqual(['old', 'shaky', 'recent']);
  });

  it('respects the limit', () => {
    const collection: SrsCollection = {
      a: createSrsItem('a', NOW), b: createSrsItem('b', NOW), c: createSrsItem('c', NOW),
    };
    expect(selectDueItems(collection, NOW, 2)).toHaveLength(2);
  });
});

describe('buildReviewQueue', () => {
  it('puts due reviews before new material', () => {
    const collection: SrsCollection = {
      known: { ...createSrsItem('known', NOW), dueAt: hoursLater(-2).toISOString() },
    };
    const queue = buildReviewQueue({
      collection, candidateIds: ['fresh1', 'known', 'fresh2'], limit: 3, now: NOW,
    });
    expect(queue[0]).toBe('known');
    expect(queue).toContain('fresh1');
  });

  it('caps new items while there is review material to interleave', () => {
    const collection: SrsCollection = {
      r1: { ...createSrsItem('r1', NOW), box: 2, dueAt: hoursLater(48).toISOString() },
      r2: { ...createSrsItem('r2', NOW), box: 3, dueAt: hoursLater(48).toISOString() },
      r3: { ...createSrsItem('r3', NOW), box: 3, dueAt: hoursLater(48).toISOString() },
      r4: { ...createSrsItem('r4', NOW), box: 3, dueAt: hoursLater(48).toISOString() },
    };
    const queue = buildReviewQueue({
      collection,
      candidateIds: ['a', 'b', 'c', 'd', 'r1', 'r2', 'r3', 'r4'],
      limit: 6,
      now: NOW,
      maxNew: 2,
    });
    const newlyAdded = queue.filter((id) => !collection[id]);
    expect(newlyAdded).toEqual(['a', 'b']);
    expect(queue).toHaveLength(6);
  });

  it('lifts the new cap rather than returning a short session', () => {
    // Nothing tracked yet, so new items are the only thing available.
    const queue = buildReviewQueue({
      collection: {},
      candidateIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      limit: 4,
      now: NOW,
      maxNew: 2,
    });
    expect(queue).toEqual(['a', 'b', 'c', 'd']);
  });

  it('still stops when candidates run out', () => {
    const queue = buildReviewQueue({ collection: {}, candidateIds: ['a', 'b'], limit: 5, now: NOW });
    expect(queue).toEqual(['a', 'b']);
  });

  it('never returns ids outside the candidate list', () => {
    const collection: SrsCollection = { retired: createSrsItem('retired', NOW) };
    const queue = buildReviewQueue({
      collection, candidateIds: ['active'], limit: 5, now: NOW,
    });
    expect(queue).toEqual(['active']);
  });

  it('tops up with not-yet-due items, least-practised first, to reach the limit', () => {
    const strong = { ...createSrsItem('strong', NOW), box: 4, dueAt: hoursLater(48).toISOString() };
    const weak = { ...createSrsItem('weak', NOW), box: 1, dueAt: hoursLater(48).toISOString() };
    const queue = buildReviewQueue({
      collection: { strong, weak },
      candidateIds: ['strong', 'weak'],
      limit: 2,
      now: NOW,
    });
    expect(queue).toEqual(['weak', 'strong']);
  });

  it('returns an empty queue for a non-positive limit', () => {
    expect(buildReviewQueue({ collection: {}, candidateIds: ['a'], limit: 0, now: NOW })).toEqual([]);
  });

  it('does not repeat an id', () => {
    const collection: SrsCollection = { a: createSrsItem('a', NOW) };
    const queue = buildReviewQueue({ collection, candidateIds: ['a', 'a', 'b'], limit: 4, now: NOW });
    expect(new Set(queue).size).toBe(queue.length);
  });
});

describe('summarizeSrs', () => {
  it('counts tracked, due and mastered items', () => {
    let mastered = createSrsItem('m', NOW);
    for (let i = 0; i < MAX_BOX; i += 1) mastered = reviewSrsItem(mastered, true, NOW);

    const summary = summarizeSrs({ m: mastered, n: createSrsItem('n', NOW) }, NOW);
    expect(summary.tracked).toBe(2);
    expect(summary.mastered).toBe(1);
    expect(summary.learning).toBe(1);
    expect(summary.due).toBe(1);
    expect(summary.masteryPercent).toBe(50);
  });

  it('reports zeroes for an empty collection', () => {
    expect(summarizeSrs({}, NOW)).toEqual({
      tracked: 0, due: 0, learning: 0, mastered: 0, masteryPercent: 0,
    });
  });
});

describe('parseSrsCollection', () => {
  it('round-trips a valid collection', () => {
    const collection = recordSrsReview({}, 'cat', true, NOW);
    expect(parseSrsCollection(JSON.parse(JSON.stringify(collection)))).toEqual(collection);
  });

  it('drops malformed entries and clamps out-of-range boxes', () => {
    const parsed = parseSrsCollection({
      good: { id: 'good', box: 99, dueAt: NOW.toISOString() },
      bad: { box: 1 },
      alsoBad: 'nope',
    });
    expect(Object.keys(parsed)).toEqual(['good']);
    expect(parsed.good.box).toBe(MAX_BOX);
  });

  it('returns an empty collection for non-object input', () => {
    expect(parseSrsCollection(null)).toEqual({});
    expect(parseSrsCollection('x')).toEqual({});
  });
});
