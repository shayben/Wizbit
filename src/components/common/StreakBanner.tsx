/**
 * StreakBanner — the streak and today's plan, shown before the child starts.
 *
 * Trophies reward consistency after the fact; this does the work that actually
 * builds the habit, by making "done for today" visible up front and naming
 * what is at stake when a streak is at risk.
 */

import React from 'react';
import ProgressRing from './ProgressRing';
import type { DailyGoal, PlanActivity, StreakState } from '../../services/dailyPlanService';

export interface StreakBannerProps {
  streak: StreakState;
  goal: DailyGoal;
  /** Jump straight into an activity from the plan. */
  onStartActivity?: (activity: PlanActivity) => void;
}

const StreakBanner: React.FC<StreakBannerProps> = ({ streak, goal, onStartActivity }) => {
  const headline = goal.allDone
    ? 'All done for today! 🎉'
    : streak.atRisk && streak.current > 0
      ? `Keep your ${streak.current}-day streak alive!`
      : streak.current > 0
        ? `${streak.current}-day streak 🔥`
        : "Today's plan";

  return (
    <section
      aria-label="Today's plan"
      className="w-full max-w-2xl rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-5 md:p-6"
    >
      <div className="flex items-center gap-4 md:gap-5">
        <ProgressRing
          percent={goal.percent}
          size={80}
          label={`${goal.completedCount}/${goal.totalCount}`}
          colorClass="text-amber-500"
          trackClass="text-amber-100"
          sublabel="today"
        />
        <div className="flex-1 min-w-0">
          <p className="text-lg md:text-xl font-extrabold text-amber-800">{headline}</p>
          <p className="text-sm md:text-base text-amber-600">
            {goal.allDone
              ? 'Come back tomorrow to keep the streak going.'
              : `${goal.totalCount - goal.completedCount} thing${goal.totalCount - goal.completedCount === 1 ? '' : 's'} left`}
            {streak.best > 1 && ` · best streak ${streak.best} days`}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {goal.tasks.map((task) => (
          <li key={task.activity}>
            <button
              type="button"
              onClick={() => onStartActivity?.(task.activity)}
              disabled={!onStartActivity}
              className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                task.done
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-white border border-amber-100 active:bg-amber-50'
              } disabled:active:bg-white`}
            >
              <span className="text-2xl" aria-hidden="true">{task.done ? '✅' : task.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className={`block font-bold ${task.done ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                  {task.label}
                </span>
                <span className="block text-xs text-gray-400">
                  {Math.min(task.completed, task.target)} / {task.target}
                </span>
              </span>
              {!task.done && onStartActivity && (
                <span aria-hidden="true" className="text-amber-500 font-bold">→</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default StreakBanner;
