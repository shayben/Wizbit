import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StreakBanner from '../components/common/StreakBanner';
import {
  applyActivity,
  buildDailyGoal,
  computeStreak,
  type DailyState,
  type PlanActivity,
} from '../services/dailyPlanService';

const NOW = new Date(2026, 2, 10, 12);
const empty: DailyState = { days: {}, best: 0 };

function renderBanner(state: DailyState, onStartActivity?: (activity: PlanActivity) => void) {
  const goal = buildDailyGoal(state, { activities: ['read', 'math-facts'], now: NOW });
  const streak = computeStreak(state, NOW);
  render(<StreakBanner goal={goal} streak={streak} onStartActivity={onStartActivity} />);
}

describe('StreakBanner', () => {
  it('shows the plan for a learner who has not started', () => {
    renderBanner(empty);
    expect(screen.getByRole('region', { name: "Today's plan" })).toBeInTheDocument();
    expect(screen.getByText("Today's plan")).toBeInTheDocument();
    expect(screen.getByText('2 things left')).toBeInTheDocument();
  });

  it('shows the running streak', () => {
    const state = applyActivity(empty, 'read', 1, NOW);
    renderBanner(state);
    expect(screen.getByText('1-day streak 🔥')).toBeInTheDocument();
  });

  it('warns when a streak is at risk today', () => {
    const yesterday = applyActivity(empty, 'read', 1, new Date(2026, 2, 9, 12));
    renderBanner(yesterday);
    expect(screen.getByText('Keep your 1-day streak alive!')).toBeInTheDocument();
  });

  it('celebrates a finished plan', () => {
    let state = applyActivity(empty, 'read', 1, NOW);
    state = applyActivity(state, 'math-facts', 10, NOW);
    renderBanner(state);
    expect(screen.getByText('All done for today! 🎉')).toBeInTheDocument();
  });

  it('shows per-task progress', () => {
    const state = applyActivity(empty, 'math-facts', 4, NOW);
    renderBanner(state);
    expect(screen.getByText('4 / 10')).toBeInTheDocument();
  });

  it('starts an activity when a task is tapped', () => {
    const onStart = vi.fn();
    renderBanner(empty, onStart);
    fireEvent.click(screen.getByRole('button', { name: /Read a passage/ }));
    expect(onStart).toHaveBeenCalledWith('read');
  });

  it('disables the tasks when no handler is supplied', () => {
    renderBanner(empty);
    expect(screen.getByRole('button', { name: /Read a passage/ })).toBeDisabled();
  });

  it('shows the best streak once there is one worth showing', () => {
    const state: DailyState = { ...applyActivity(empty, 'read', 1, NOW), best: 9 };
    renderBanner(state);
    expect(screen.getByText(/best streak 9 days/)).toBeInTheDocument();
  });
});
