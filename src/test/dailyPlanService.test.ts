import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import {
  ACTIVITY_META,
  applyActivity,
  buildDailyGoal,
  computeStreak,
  daysBetween,
  defaultPlanActivities,
  loadDailyState,
  localDateKey,
  recentActivityCounts,
  recordActivity,
  type DailyState,
} from '../services/dailyPlanService';

/** Local-noon dates avoid any timezone edge in the test itself. */
const day = (iso: string) => new Date(`${iso}T12:00:00`);
const TODAY = day('2026-03-10');

beforeEach(() => {
  localStorage.clear();
});

function stateWith(dates: string[]): DailyState {
  return {
    days: Object.fromEntries(dates.map((d) => [d, { read: 1 }])),
    best: 0,
  };
}

describe('localDateKey', () => {
  it('formats a local date', () => {
    expect(localDateKey(day('2026-03-10'))).toBe('2026-03-10');
  });

  it('uses the local day, not UTC', () => {
    // 11pm local on the 10th is still the 10th to the child, even if UTC has rolled over.
    const late = new Date(2026, 2, 10, 23, 30);
    expect(localDateKey(late)).toBe('2026-03-10');
  });

  it('zero-pads months and days', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('daysBetween', () => {
  it('counts consecutive days as one apart', () => {
    expect(daysBetween('2026-03-09', '2026-03-10')).toBe(1);
  });

  it('spans month boundaries', () => {
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('returns zero for the same day', () => {
    expect(daysBetween('2026-03-10', '2026-03-10')).toBe(0);
  });
});

describe('computeStreak', () => {
  it('reports no streak for a new learner', () => {
    expect(computeStreak({ days: {}, best: 0 }, TODAY)).toMatchObject({ current: 0, atRisk: false });
  });

  it('counts consecutive days ending today', () => {
    const state = stateWith(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(computeStreak(state, TODAY).current).toBe(3);
  });

  it('keeps a streak alive but flags it at risk when today is still empty', () => {
    const streak = computeStreak(stateWith(['2026-03-08', '2026-03-09']), TODAY);
    expect(streak.current).toBe(2);
    expect(streak.atRisk).toBe(true);
  });

  it('breaks the streak after a missed day', () => {
    const streak = computeStreak(stateWith(['2026-03-06', '2026-03-07']), TODAY);
    expect(streak.current).toBe(0);
    expect(streak.atRisk).toBe(false);
  });

  it('ignores days recorded before a gap', () => {
    const state = stateWith(['2026-03-01', '2026-03-02', '2026-03-09', '2026-03-10']);
    expect(computeStreak(state, TODAY).current).toBe(2);
  });

  it('remembers the best streak even after it breaks', () => {
    const state: DailyState = { ...stateWith(['2026-03-01']), best: 12 };
    expect(computeStreak(state, TODAY).best).toBe(12);
  });

  it('is not at risk on a day that already has activity', () => {
    expect(computeStreak(stateWith(['2026-03-10']), TODAY).atRisk).toBe(false);
  });
});

describe('applyActivity', () => {
  it('records work against today', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'read', 1, TODAY);
    expect(state.days['2026-03-10'].read).toBe(1);
  });

  it('accumulates repeated work', () => {
    let state = applyActivity({ days: {}, best: 0 }, 'math-facts', 4, TODAY);
    state = applyActivity(state, 'math-facts', 6, TODAY);
    expect(state.days['2026-03-10']['math-facts']).toBe(10);
  });

  it('updates the best streak as it grows', () => {
    const state = applyActivity(stateWith(['2026-03-08', '2026-03-09']), 'read', 1, TODAY);
    expect(state.best).toBe(3);
  });

  it('ignores a non-positive amount', () => {
    const before: DailyState = { days: {}, best: 0 };
    expect(applyActivity(before, 'read', 0, TODAY)).toBe(before);
  });

  it('does not mutate the input state', () => {
    const before: DailyState = { days: {}, best: 0 };
    applyActivity(before, 'read', 1, TODAY);
    expect(before.days).toEqual({});
  });
});

describe('buildDailyGoal', () => {
  it('marks a task done once its target is met', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'sight-words', 10, TODAY);
    const goal = buildDailyGoal(state, { activities: ['sight-words'], now: TODAY });
    expect(goal.tasks[0].done).toBe(true);
    expect(goal.allDone).toBe(true);
    expect(goal.percent).toBe(100);
  });

  it('leaves a partially finished task open', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'sight-words', 3, TODAY);
    const goal = buildDailyGoal(state, { activities: ['sight-words'], now: TODAY });
    expect(goal.tasks[0]).toMatchObject({ completed: 3, done: false });
  });

  it('honours a target override', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'read', 1, TODAY);
    const goal = buildDailyGoal(state, { activities: ['read'], targets: { read: 2 }, now: TODAY });
    expect(goal.tasks[0].target).toBe(2);
    expect(goal.tasks[0].done).toBe(false);
  });

  it('reports partial progress across several tasks', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'read', 1, TODAY);
    const goal = buildDailyGoal(state, { activities: ['read', 'math-facts'], now: TODAY });
    expect(goal.completedCount).toBe(1);
    expect(goal.totalCount).toBe(2);
    expect(goal.percent).toBe(50);
  });

  it('does not count yesterday’s work towards today', () => {
    const state = applyActivity({ days: {}, best: 0 }, 'read', 1, day('2026-03-09'));
    expect(buildDailyGoal(state, { activities: ['read'], now: TODAY }).tasks[0].completed).toBe(0);
  });

  it('handles an empty plan without dividing by zero', () => {
    const goal = buildDailyGoal({ days: {}, best: 0 }, { activities: [], now: TODAY });
    expect(goal).toMatchObject({ percent: 0, allDone: false, totalCount: 0 });
  });

  it('uses the default target for each activity', () => {
    const goal = buildDailyGoal({ days: {}, best: 0 }, { activities: ['math-facts'], now: TODAY });
    expect(goal.tasks[0].target).toBe(ACTIVITY_META['math-facts'].defaultTarget);
  });
});

describe('defaultPlanActivities', () => {
  it('gives a younger child a shorter plan', () => {
    expect(defaultPlanActivities(true).length).toBeLessThan(defaultPlanActivities(false).length);
  });

  it('always includes reading', () => {
    expect(defaultPlanActivities(true)).toContain('read');
    expect(defaultPlanActivities(false)).toContain('read');
  });
});

describe('recentActivityCounts', () => {
  it('returns one entry per day, oldest first', () => {
    const counts = recentActivityCounts({ days: {}, best: 0 }, 7, TODAY);
    expect(counts).toHaveLength(7);
    expect(counts[6].date).toBe('2026-03-10');
  });

  it('sums every activity for a day', () => {
    let state = applyActivity({ days: {}, best: 0 }, 'read', 1, TODAY);
    state = applyActivity(state, 'math-facts', 9, TODAY);
    expect(recentActivityCounts(state, 3, TODAY).at(-1)!.count).toBe(10);
  });
});

describe('recordActivity', () => {
  it('persists per learner', async () => {
    await recordActivity('acct::kid', 'read', 1, TODAY);
    expect((await loadDailyState('acct::kid')).days['2026-03-10'].read).toBe(1);
    expect((await loadDailyState('acct::other')).days).toEqual({});
  });
});
