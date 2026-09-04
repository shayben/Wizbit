import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import {
  SIGHT_WORD_TIERS,
  buildSightWordSession,
  loadSightWordProgress,
  recordSightWord,
  sightWordProgress,
  tiersForGrade,
  wordsForGrade,
} from '../services/sightWordService';
import { createSrsItem, reviewSrsItem, type SrsCollection } from '../services/srsService';

const NOW = new Date('2026-03-01T10:00:00.000Z');

beforeEach(() => {
  localStorage.clear();
});

/** Promote a word all the way to mastery. */
function mastered(word: string): SrsCollection[string] {
  let item = createSrsItem(word, NOW);
  for (let i = 0; i < 5; i += 1) item = reviewSrsItem(item, true, NOW);
  return item;
}

describe('word list integrity', () => {
  it('has no duplicate words across tiers', () => {
    const all = SIGHT_WORD_TIERS.flatMap((t) => t.words.map((w) => w.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });

  it('has no blank entries', () => {
    for (const tier of SIGHT_WORD_TIERS) {
      expect(tier.words.every((w) => w.trim().length > 0)).toBe(true);
    }
  });

  it('covers the Fry first 300', () => {
    expect(SIGHT_WORD_TIERS.flatMap((t) => t.words).length).toBeGreaterThanOrEqual(300);
  });
});

describe('tiersForGrade', () => {
  it('includes earlier tiers so review continues', () => {
    const ids = tiersForGrade('3').map((t) => t.id);
    expect(ids).toContain('fry-1');
    expect(ids).toContain('fry-8');
  });

  it('gives a first grader fewer words than a third grader', () => {
    expect(wordsForGrade('1').length).toBeLessThan(wordsForGrade('3').length);
  });

  it('never returns an empty tier list', () => {
    expect(tiersForGrade('K').length).toBeGreaterThan(0);
  });

  it('excludes above-level tiers', () => {
    expect(tiersForGrade('1').map((t) => t.id)).not.toContain('fry-7');
  });
});

describe('buildSightWordSession', () => {
  it('starts a new learner on the very first words', () => {
    const session = buildSightWordSession({}, '1', 5, NOW);
    expect(session.length).toBeGreaterThan(0);
    expect(SIGHT_WORD_TIERS[0].words).toContain(session[0]);
  });

  it('surfaces a word that is due for review ahead of new words', () => {
    const collection: SrsCollection = {
      because: { ...createSrsItem('because', NOW), dueAt: new Date(NOW.getTime() - 3600_000).toISOString() },
    };
    // "because" lives in a grade-2 tier, so use a grade that includes it.
    expect(buildSightWordSession(collection, '3', 5, NOW)[0]).toBe('because');
  });

  it('never returns words above the learner’s grade', () => {
    const allowed = new Set(wordsForGrade('1'));
    for (const word of buildSightWordSession({}, '1', 10, NOW)) {
      expect(allowed.has(word)).toBe(true);
    }
  });

  it('respects the requested session size', () => {
    expect(buildSightWordSession({}, '3', 4, NOW).length).toBeLessThanOrEqual(4);
  });

  it('does not repeat a word within one session', () => {
    const session = buildSightWordSession({}, '3', 10, NOW);
    expect(new Set(session).size).toBe(session.length);
  });
});

describe('recordSightWord', () => {
  it('persists an outcome for the learner', async () => {
    await recordSightWord('acct::kid', 'the', true, NOW);
    const progress = await loadSightWordProgress('acct::kid');
    expect(progress.the.box).toBe(1);
    expect(progress.the.streak).toBe(1);
  });

  it('keeps two learners on one account separate', async () => {
    await recordSightWord('acct::kid-a', 'the', true, NOW);
    expect(await loadSightWordProgress('acct::kid-b')).toEqual({});
  });

  it('brings a missed word back into the next session', async () => {
    await recordSightWord('acct::kid', 'the', true, NOW);
    const after = await recordSightWord('acct::kid', 'the', false, NOW);
    expect(after.the.box).toBe(0);
    expect(buildSightWordSession(after, '1', 5, NOW)).toContain('the');
  });
});

describe('sightWordProgress', () => {
  it('reports zero for an untouched learner', () => {
    const progress = sightWordProgress({}, '1', NOW);
    expect(progress.listPercent).toBe(0);
    expect(progress.available).toBe(wordsForGrade('1').length);
  });

  it('counts mastered words towards the tier and list totals', () => {
    const first = SIGHT_WORD_TIERS[0].words[0];
    const progress = sightWordProgress({ [first]: mastered(first) }, '1', NOW);
    expect(progress.mastered).toBe(1);
    expect(progress.listPercent).toBeGreaterThan(0);
    expect(progress.tiers[0].mastered).toBe(1);
  });

  it('does not count a word still in an early box as mastered', () => {
    const first = SIGHT_WORD_TIERS[0].words[0];
    const collection = { [first]: reviewSrsItem(createSrsItem(first, NOW), true, NOW) };
    expect(sightWordProgress(collection, '1', NOW).mastered).toBe(0);
  });

  it('lists one row per tier at the learner’s grade', () => {
    expect(sightWordProgress({}, '3', NOW).tiers).toHaveLength(tiersForGrade('3').length);
  });
});
