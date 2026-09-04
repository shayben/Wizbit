import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import {
  SPELLING_PATTERNS,
  buildSpellingSession,
  checkSpelling,
  loadSpellingProgress,
  patternForWord,
  patternsForGrade,
  recordSpellingWord,
  spellingProgress,
  spellingWordsForGrade,
  spellingWordsForPattern,
} from '../services/spellingService';

const NOW = new Date('2026-03-01T10:00:00.000Z');

beforeEach(() => {
  localStorage.clear();
});

describe('pattern list integrity', () => {
  it('gives every pattern a rule, emoji and words', () => {
    for (const pattern of SPELLING_PATTERNS) {
      expect(pattern.rule.length).toBeGreaterThan(0);
      expect(pattern.emoji.length).toBeGreaterThan(0);
      expect(pattern.words.length).toBeGreaterThan(0);
    }
  });

  it('uses unique pattern ids', () => {
    const ids = SPELLING_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('patternsForGrade', () => {
  it('includes earlier patterns for review', () => {
    const ids = patternsForGrade('3').map((p) => p.id);
    expect(ids).toContain('silent-e');
    expect(ids).toContain('y-to-i');
  });

  it('excludes patterns above the grade', () => {
    expect(patternsForGrade('1').map((p) => p.id)).not.toContain('suffix-tion');
  });

  it('gives a first grader a shorter list than a third grader', () => {
    expect(spellingWordsForGrade('1').length).toBeLessThan(spellingWordsForGrade('3').length);
  });
});

describe('patternForWord', () => {
  it('finds the pattern that teaches a word', () => {
    expect(patternForWord('cake')?.id).toBe('silent-e');
  });

  it('is case-insensitive', () => {
    expect(patternForWord('CAKE')?.id).toBe('silent-e');
  });

  it('returns undefined for an unknown word', () => {
    expect(patternForWord('zzzzz')).toBeUndefined();
  });
});

describe('checkSpelling', () => {
  it('accepts an exact match', () => {
    const result = checkSpelling('cake', 'cake');
    expect(result.correct).toBe(true);
    expect(result.firstDivergence).toBe(-1);
  });

  it('forgives capitalisation and stray spaces', () => {
    const result = checkSpelling('cake', '  Cake ');
    expect(result.correct).toBe(true);
    expect(result.caseOnly).toBe(true);
  });

  it('rejects a wrong spelling and points at the first bad letter', () => {
    const result = checkSpelling('cake', 'kake');
    expect(result.correct).toBe(false);
    expect(result.firstDivergence).toBe(0);
  });

  it('credits the correct prefix before the mistake', () => {
    const result = checkSpelling('making', 'makeing');
    expect(result.firstDivergence).toBe(3); // m-a-k match, then i vs e
    expect(result.hint).toContain('"mak"');
  });

  it('names the spelling rule in the hint when the word has one', () => {
    expect(checkSpelling('cake', 'cak').hint).toContain('silent e');
  });

  it('nudges a child who submitted nothing', () => {
    const result = checkSpelling('cake', '   ');
    expect(result.correct).toBe(false);
    expect(result.hint).toContain('starts with');
  });

  it('treats a missing-letter answer as wrong', () => {
    expect(checkSpelling('running', 'runing').correct).toBe(false);
  });

  it('normalises curly apostrophes', () => {
    expect(checkSpelling("it's", 'it’s').correct).toBe(true);
  });
});

describe('buildSpellingSession', () => {
  it('produces words from the learner’s grade', () => {
    const allowed = new Set(spellingWordsForGrade('1'));
    for (const word of buildSpellingSession({}, '1', 6, NOW)) {
      expect(allowed.has(word)).toBe(true);
    }
  });

  it('can be restricted to a single pattern', () => {
    const words = buildSpellingSession({}, '3', 8, NOW, 'silent-e');
    const allowed = new Set(spellingWordsForPattern('silent-e'));
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) expect(allowed.has(word)).toBe(true);
  });

  it('returns nothing for an unknown pattern id', () => {
    expect(buildSpellingSession({}, '3', 8, NOW, 'nope')).toEqual([]);
  });

  it('respects the session size', () => {
    expect(buildSpellingSession({}, '3', 3, NOW).length).toBeLessThanOrEqual(3);
  });
});

describe('recordSpellingWord', () => {
  it('persists progress per learner', async () => {
    await recordSpellingWord('acct::kid', 'cake', true, NOW);
    expect((await loadSpellingProgress('acct::kid')).cake.box).toBe(1);
    expect(await loadSpellingProgress('acct::other')).toEqual({});
  });

  it('re-queues a missed word immediately', async () => {
    const after = await recordSpellingWord('acct::kid', 'cake', false, NOW);
    expect(buildSpellingSession(after, '3', 8, NOW, 'silent-e')).toContain('cake');
  });
});

describe('spellingProgress', () => {
  it('returns one row per pattern at the grade', () => {
    expect(spellingProgress({}, '1', NOW).patterns).toHaveLength(patternsForGrade('1').length);
  });

  it('starts every pattern at zero percent', () => {
    for (const row of spellingProgress({}, '3', NOW).patterns) {
      expect(row.percent).toBe(0);
    }
  });
});
