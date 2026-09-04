/**
 * Records the cross-cutting consequences of finishing a learning activity.
 *
 * Every activity feeds the same three systems — the daily plan, buddy XP, and
 * (optionally) a per-item spaced-repetition store. Centralising that here
 * keeps each activity component focused on its own interaction and means a new
 * activity gets streaks and XP by wiring up one hook.
 */

import { useCallback } from 'react';
import { recordActivity, type PlanActivity } from '../services/dailyPlanService';
import { awardBuddyXp, xpForSession, type BuddyAward } from '../services/buddyService';
import type { QuizSummary } from '../services/quizSummary';

export interface ActivityRecorder {
  /** Call when an activity finishes. Returns the buddy award, if any. */
  complete: (summary: QuizSummary) => Promise<BuddyAward | null>;
}

export function useActivityRecorder(
  uid: string | null,
  activity: PlanActivity,
): ActivityRecorder {
  const complete = useCallback(async (summary: QuizSummary) => {
    // Credit the plan by the number of items actually answered, so a partial
    // session still counts towards the daily goal.
    if (summary.total > 0) {
      await recordActivity(uid, activity, summary.total).catch(() => {});
    }

    const xp = xpForSession(summary.correct, summary.bestStreak, summary.total > 0);
    if (xp <= 0) return null;

    try {
      return await awardBuddyXp(uid, xp);
    } catch {
      return null;
    }
  }, [uid, activity]);

  return { complete };
}
