import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import {
  FLUENT_MS,
  MIN_ATTEMPTS_FOR_MASTERY,
  applyFactResult,
  buildFactDrill,
  buildFactTable,
  factGrid,
  factId,
  factMastery,
  factsForOperation,
  loadFactState,
  makeFact,
  recordFactResult,
  summarizeFactTable,
  type FactState,
} from '../services/mathFactService';

const NOW = new Date('2026-03-01T10:00:00.000Z');
const empty: FactState = { srs: {}, stats: {} };

beforeEach(() => {
  localStorage.clear();
});

/** Answer a fact `times` times, correctly and quickly. */
function drillFluent(id: string, times = 6, ms = 1200): FactState {
  let state = empty;
  for (let i = 0; i < times; i += 1) state = applyFactResult(state, id, true, ms, NOW);
  return state;
}

describe('makeFact', () => {
  it('builds a multiplication fact', () => {
    const fact = makeFact('mul', 7, 8);
    expect(fact.answer).toBe(56);
    expect(fact.prompt).toBe('7 × 8 = ?');
    expect(fact.id).toBe(factId('mul', 7, 8));
  });

  it('builds addition facts', () => {
    expect(makeFact('add', 6, 7)).toMatchObject({ answer: 13, prompt: '6 + 7 = ?' });
  });

  it('never produces a negative subtraction answer', () => {
    for (const fact of factsForOperation('sub')) {
      expect(fact.answer).toBeGreaterThanOrEqual(0);
      expect(fact.prompt).toMatch(/^\d+ − \d+ = \?$/);
    }
  });

  it('never produces a division fact with a remainder or a zero divisor', () => {
    for (const fact of factsForOperation('div')) {
      expect(Number.isInteger(fact.answer)).toBe(true);
      expect(fact.right).toBeGreaterThan(0);
    }
  });

  it('makes every prompt arithmetically true', () => {
    for (const operation of ['add', 'sub', 'mul', 'div'] as const) {
      for (const fact of factsForOperation(operation)) {
        const [, a, op, b] = fact.prompt.match(/^(\d+) ([+−×÷]) (\d+) = \?$/)!;
        const left = Number(a);
        const right = Number(b);
        const expected = op === '+' ? left + right
          : op === '−' ? left - right
          : op === '×' ? left * right
          : left / right;
        expect(fact.answer).toBe(expected);
      }
    }
  });
});

describe('buildFactTable', () => {
  it('produces the full 10x10 multiplication grid plus zeroes', () => {
    expect(buildFactTable('mul', 10, 0)).toHaveLength(121);
  });

  it('uses unique ids', () => {
    const ids = buildFactTable('mul', 10, 0).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('applyFactResult', () => {
  it('records the first attempt', () => {
    const state = applyFactResult(empty, 'mul:7x8', true, 1500, NOW);
    expect(state.stats['mul:7x8']).toMatchObject({ attempts: 1, correct: 1, averageMs: 1500, bestMs: 1500 });
  });

  it('keeps the fastest correct time as the best', () => {
    let state = applyFactResult(empty, 'mul:7x8', true, 4000, NOW);
    state = applyFactResult(state, 'mul:7x8', true, 1100, NOW);
    expect(state.stats['mul:7x8'].bestMs).toBe(1100);
  });

  it('does not let a wrong answer set a best time', () => {
    const state = applyFactResult(empty, 'mul:7x8', false, 500, NOW);
    expect(state.stats['mul:7x8'].bestMs).toBe(0);
  });

  it('smooths the average rather than jumping to the latest time', () => {
    let state = applyFactResult(empty, 'mul:7x8', true, 1000, NOW);
    state = applyFactResult(state, 'mul:7x8', true, 5000, NOW);
    expect(state.stats['mul:7x8'].averageMs).toBeGreaterThan(1000);
    expect(state.stats['mul:7x8'].averageMs).toBeLessThan(5000);
  });

  it('drops a missed fact back for immediate review', () => {
    let state = drillFluent('mul:7x8', 3);
    state = applyFactResult(state, 'mul:7x8', false, 2000, NOW);
    expect(state.srs['mul:7x8'].box).toBe(0);
  });

  it('ignores a nonsensical response time', () => {
    const state = applyFactResult(empty, 'mul:7x8', true, Number.NaN, NOW);
    expect(state.stats['mul:7x8'].averageMs).toBe(0);
  });

  it('does not mutate the input state', () => {
    applyFactResult(empty, 'mul:7x8', true, 1000, NOW);
    expect(empty.stats).toEqual({});
  });
});

describe('factMastery', () => {
  it('reports an untouched fact as new', () => {
    expect(factMastery(empty, 'mul:7x8').level).toBe('new');
  });

  it('needs several attempts before judging a fact', () => {
    let state = empty;
    for (let i = 0; i < MIN_ATTEMPTS_FOR_MASTERY - 1; i += 1) {
      state = applyFactResult(state, 'mul:2x2', true, 900, NOW);
    }
    expect(factMastery(state, 'mul:2x2').level).toBe('learning');
  });

  it('marks a fast, accurate, well-reviewed fact as fluent', () => {
    expect(factMastery(drillFluent('mul:2x2'), 'mul:2x2').level).toBe('fluent');
  });

  it('marks a correct but slow fact as accurate, not fluent', () => {
    const slow = drillFluent('mul:7x8', 6, FLUENT_MS + 4000);
    expect(factMastery(slow, 'mul:7x8').level).toBe('accurate');
  });

  it('marks an inaccurate fact as learning however fast it is', () => {
    let state = empty;
    for (let i = 0; i < 6; i += 1) state = applyFactResult(state, 'mul:7x8', i % 2 === 0, 500, NOW);
    expect(factMastery(state, 'mul:7x8').level).toBe('learning');
  });

  it('reports accuracy as a percentage', () => {
    let state = applyFactResult(empty, 'mul:3x3', true, 1000, NOW);
    state = applyFactResult(state, 'mul:3x3', false, 1000, NOW);
    expect(factMastery(state, 'mul:3x3').accuracy).toBe(50);
  });
});

describe('summarizeFactTable', () => {
  it('counts an untouched table as entirely new', () => {
    const summary = summarizeFactTable(empty, 'mul');
    expect(summary.untouched).toBe(summary.total);
    expect(summary.fluentPercent).toBe(0);
  });

  it('counts a mastered fact towards the fluent total', () => {
    const summary = summarizeFactTable(drillFluent('mul:2x2'), 'mul');
    expect(summary.fluent).toBe(1);
    expect(summary.untouched).toBe(summary.total - 1);
  });

  it('surfaces the least accurate facts first', () => {
    let state = empty;
    for (let i = 0; i < 6; i += 1) state = applyFactResult(state, 'mul:7x8', false, 4000, NOW);
    for (let i = 0; i < 6; i += 1) state = applyFactResult(state, 'mul:3x3', i < 5, 4000, NOW);
    expect(summarizeFactTable(state, 'mul').weakest[0].factId).toBe('mul:7x8');
  });
});

describe('buildFactDrill', () => {
  it('starts a new learner on the easiest facts', () => {
    const drill = buildFactDrill({ state: empty, operation: 'mul', size: 4, now: NOW });
    expect(drill).toHaveLength(4);
    for (const fact of drill) expect(fact.left + fact.right).toBeLessThan(8);
  });

  it('pulls a fact that was just missed to the front', () => {
    const state = applyFactResult(empty, factId('mul', 7, 8), false, 5000, NOW);
    const drill = buildFactDrill({ state, operation: 'mul', size: 5, now: NOW });
    expect(drill[0].id).toBe(factId('mul', 7, 8));
  });

  it('can focus on a single times table', () => {
    const drill = buildFactDrill({ state: empty, operation: 'mul', size: 6, now: NOW, focusFactor: 7 });
    expect(drill.length).toBeGreaterThan(0);
    for (const fact of drill) {
      expect(fact.left === 7 || fact.right === 7).toBe(true);
    }
  });

  it('does not repeat a fact within one drill', () => {
    const ids = buildFactDrill({ state: empty, operation: 'mul', size: 10, now: NOW }).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns real facts, never dangling ids', () => {
    for (const fact of buildFactDrill({ state: empty, operation: 'div', size: 8, now: NOW })) {
      expect(fact.prompt).toBeTruthy();
      expect(Number.isFinite(fact.answer)).toBe(true);
    }
  });
});

describe('factGrid', () => {
  it('lays out the multiplication table as square rows', () => {
    const grid = factGrid(empty, 'mul');
    expect(grid).toHaveLength(11);
    expect(grid[0]).toHaveLength(11);
  });

  it('reflects mastery in the right cell', () => {
    const grid = factGrid(drillFluent(factId('mul', 2, 3)), 'mul');
    expect(grid[2][3].level).toBe('fluent');
    expect(grid[3][2].level).toBe('new');
  });
});

describe('recordFactResult', () => {
  it('persists per learner', async () => {
    await recordFactResult('acct::kid', 'mul:7x8', true, 1200, NOW);
    expect((await loadFactState('acct::kid')).stats['mul:7x8'].attempts).toBe(1);
    expect((await loadFactState('acct::other')).stats).toEqual({});
  });

  it('accumulates across calls', async () => {
    await recordFactResult('acct::kid', 'mul:7x8', true, 1200, NOW);
    const state = await recordFactResult('acct::kid', 'mul:7x8', false, 3000, NOW);
    expect(state.stats['mul:7x8']).toMatchObject({ attempts: 2, correct: 1 });
  });
});
