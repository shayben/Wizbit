import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import { useActivityRecorder } from '../hooks/useActivityRecorder';
import { loadDailyState } from '../services/dailyPlanService';
import { loadBuddyState } from '../services/buddyService';
import type { QuizSummary } from '../services/quizSummary';

const UID = 'acct::kid';

function summary(overrides: Partial<QuizSummary> = {}): QuizSummary {
  return {
    correct: 8, total: 10, accuracy: 80, bestStreak: 4, averageMs: 2000, outcomes: [], ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('useActivityRecorder', () => {
  it('credits the daily plan by the number of items answered', async () => {
    const { result } = renderHook(() => useActivityRecorder(UID, 'math-facts'));
    await act(async () => { await result.current.complete(summary()); });

    const daily = await loadDailyState(UID);
    expect(Object.values(daily.days)[0]?.['math-facts']).toBe(10);
  });

  it('awards buddy XP scaled to correct answers', async () => {
    const { result } = renderHook(() => useActivityRecorder(UID, 'math-facts'));
    let award = null;
    await act(async () => { award = await result.current.complete(summary()); });

    expect(award).not.toBeNull();
    expect((await loadBuddyState(UID)).xp).toBeGreaterThan(0);
  });

  it('records nothing for an empty session', async () => {
    const { result } = renderHook(() => useActivityRecorder(UID, 'spelling'));
    await act(async () => {
      await result.current.complete(summary({ correct: 0, total: 0, bestStreak: 0 }));
    });

    expect((await loadDailyState(UID)).days).toEqual({});
    expect((await loadBuddyState(UID)).xp).toBe(0);
  });

  it('still credits the plan when the child got everything wrong', async () => {
    const { result } = renderHook(() => useActivityRecorder(UID, 'spelling'));
    await act(async () => {
      await result.current.complete(summary({ correct: 0, total: 6, accuracy: 0, bestStreak: 0 }));
    });

    const daily = await loadDailyState(UID);
    expect(Object.values(daily.days)[0]?.spelling).toBe(6);
  });

  it('keeps two learners’ XP apart', async () => {
    const { result } = renderHook(() => useActivityRecorder('acct::a', 'math-facts'));
    await act(async () => { await result.current.complete(summary()); });

    expect((await loadBuddyState('acct::a')).xp).toBeGreaterThan(0);
    expect((await loadBuddyState('acct::b')).xp).toBe(0);
  });

  it('works for an anonymous learner', async () => {
    const { result } = renderHook(() => useActivityRecorder(null, 'read'));
    await act(async () => { await result.current.complete(summary({ total: 1, correct: 1 })); });

    expect(Object.values((await loadDailyState(null)).days)[0]?.read).toBe(1);
  });
});
