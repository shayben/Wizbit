import { describe, it, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock('../services/apiClient', () => ({
  apiPost: api.apiPost, QuotaExceededError: class extends Error {},
}));

import {
  STRUCTURE_META,
  generateOfflineWordProblems,
  generateWordProblems,
  seededRandom,
  structuresForGrade,
} from '../services/wordProblemService';

beforeEach(() => {
  api.apiPost.mockReset();
});

describe('seededRandom', () => {
  it('is deterministic for a seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('produces different streams for different seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it('stays inside the unit interval', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 200; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('structuresForGrade', () => {
  it('keeps multi-step problems away from first graders', () => {
    expect(structuresForGrade('1')).not.toContain('multi-step');
    expect(structuresForGrade('1')).not.toContain('equal-groups');
  });

  it('gives third graders equal groups and multi-step', () => {
    expect(structuresForGrade('3')).toContain('equal-groups');
    expect(structuresForGrade('3')).toContain('multi-step');
  });
});

describe('generateOfflineWordProblems', () => {
  it('produces the requested number of problems', () => {
    expect(generateOfflineWordProblems('3', 5)).toHaveLength(5);
  });

  it('is deterministic for a given seed', () => {
    expect(generateOfflineWordProblems('3', 4, 99)).toEqual(generateOfflineWordProblems('3', 4, 99));
  });

  it('varies with the seed', () => {
    const a = generateOfflineWordProblems('3', 4, 1).map((p) => p.text);
    const b = generateOfflineWordProblems('3', 4, 2).map((p) => p.text);
    expect(a).not.toEqual(b);
  });

  it('produces whole-number answers a child can type', () => {
    for (const grade of ['K', '1', '2', '3', '4', '5'] as const) {
      for (const problem of generateOfflineWordProblems(grade, 12, 5)) {
        expect(Number.isInteger(problem.answer)).toBe(true);
      }
    }
  });

  it('never produces a negative answer', () => {
    for (const grade of ['K', '1', '3', '5'] as const) {
      for (const problem of generateOfflineWordProblems(grade, 20, 3)) {
        expect(problem.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('states an equation that evaluates to the stated answer', () => {
    for (const problem of generateOfflineWordProblems('3', 20, 11)) {
      const [expression, stated] = problem.equation.split('=').map((s) => s.trim());
      const evaluated = Function(`"use strict"; return (${expression.replace(/−/g, '-').replace(/×/g, '*')})`)();
      expect(evaluated).toBe(problem.answer);
      expect(Number(stated)).toBe(problem.answer);
    }
  });

  it('only uses structures allowed at the grade', () => {
    const allowed = new Set(structuresForGrade('1'));
    for (const problem of generateOfflineWordProblems('1', 10)) {
      expect(allowed.has(problem.structure)).toBe(true);
    }
  });

  it('keeps first-grade numbers small', () => {
    for (const problem of generateOfflineWordProblems('1', 15, 4)) {
      expect(problem.answer).toBeLessThanOrEqual(20);
    }
  });

  it('gives every problem a unit, strategy and non-empty text', () => {
    for (const problem of generateOfflineWordProblems('3', 10)) {
      expect(problem.text.length).toBeGreaterThan(10);
      expect(problem.unit.length).toBeGreaterThan(0);
      expect(problem.strategy.length).toBeGreaterThan(0);
    }
  });

  it('returns nothing for a non-positive count', () => {
    expect(generateOfflineWordProblems('3', 0)).toEqual([]);
    expect(generateOfflineWordProblems('3', -2)).toEqual([]);
  });

  it('names two different children in a comparison problem', () => {
    const compare = generateOfflineWordProblems('1', 12, 8).find((p) => p.structure === 'compare');
    expect(compare).toBeDefined();
    // The two names in a compare problem must differ for the question to make sense.
    const names = compare!.text.match(/\b(Maya|Ben|Ava|Noah|Lily|Sam|Ella|Leo|Zoe|Max)\b/g) ?? [];
    expect(new Set(names).size).toBeGreaterThan(1);
  });
});

describe('generateWordProblems', () => {
  it('uses model output when it is well-formed', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        problems: [{
          text: 'Maya has 3 dinosaurs and finds 4 more. How many now?',
          answer: 7, unit: 'dinosaurs', structure: 'join',
          equation: '3 + 4 = 7', strategy: 'Add them together.',
        }],
      }),
    });

    const result = await generateWordProblems({ grade: '1', count: 1, learnerName: 'Maya', interest: 'dinosaurs' });
    expect(result.offline).toBe(false);
    expect(result.problems[0].text).toContain('dinosaurs');
  });

  it('charges the learning-activity quota bucket', async () => {
    api.apiPost.mockResolvedValue({ content: '{"problems":[]}' });
    await generateWordProblems({ grade: '3', count: 3 });
    expect(api.apiPost).toHaveBeenCalledWith(
      '/openai/chat',
      expect.objectContaining({ purpose: 'learning-activity' }),
    );
  });

  it('falls back to templates when the request fails', async () => {
    api.apiPost.mockRejectedValue(new Error('offline'));
    const result = await generateWordProblems({ grade: '3', count: 3, seed: 7 });
    expect(result.offline).toBe(true);
    expect(result.problems).toHaveLength(3);
  });

  it('falls back when the model returns unusable JSON', async () => {
    api.apiPost.mockResolvedValue({ content: 'I cannot help with that' });
    expect((await generateWordProblems({ grade: '3', count: 2 })).offline).toBe(true);
  });

  it('discards problems whose answer is not a whole number', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        problems: [
          { text: 'Fractional', answer: 2.5, unit: '', structure: 'join', equation: '', strategy: '' },
          { text: 'Whole', answer: 6, unit: 'cats', structure: 'join', equation: '', strategy: '' },
        ],
      }),
    });
    const result = await generateWordProblems({ grade: '3', count: 2 });
    expect(result.problems.map((p) => p.text)).toEqual(['Whole']);
  });

  it('falls back when every model problem is rejected', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        problems: [{ text: 'Bad', answer: 1.5, unit: '', structure: 'join', equation: '', strategy: '' }],
      }),
    });
    expect((await generateWordProblems({ grade: '3', count: 2 })).offline).toBe(true);
  });

  it('fills a missing strategy from the structure label', async () => {
    api.apiPost.mockResolvedValue({
      content: JSON.stringify({
        problems: [{ text: 'Q', answer: 4, unit: '', structure: 'compare', equation: '', strategy: '' }],
      }),
    });
    const result = await generateWordProblems({ grade: '3', count: 1 });
    expect(result.problems[0].strategy).toBe(STRUCTURE_META.compare.label);
  });
});
