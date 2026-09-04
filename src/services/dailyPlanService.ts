/**
 * Daily plan, goal and streak.
 *
 * Trophies already reward consistency, but only *after* the fact — nothing in
 * the app tells a child, before they start, what "done for today" looks like or
 * what they stand to lose by skipping. That framing is what actually drives
 * the habit at this age, so the streak and the goal live on the home screen.
 *
 * A day is counted in the learner's local timezone: a session at 7pm and one
 * at 8am the next morning are two different days to a child, whatever UTC says.
 */

import { createScopedStore } from './scopedStore';

/** The learning activities a daily plan can include. */
export type PlanActivity = 'read' | 'practice-words' | 'sight-words' | 'spelling' | 'math-facts' | 'word-problems';

export interface PlanTask {
  activity: PlanActivity;
  label: string;
  emoji: string;
  /** How many units (words, facts, minutes) count as done. */
  target: number;
  completed: number;
  done: boolean;
}

export interface DailyGoal {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  tasks: PlanTask[];
  /** Tasks finished out of the total. */
  completedCount: number;
  totalCount: number;
  percent: number;
  allDone: boolean;
}

export interface StreakState {
  /** Consecutive days, counting today only once something is done. */
  current: number;
  /** Best run ever. */
  best: number;
  /** Local date of the most recent day with any activity. */
  lastActiveDate: string | null;
  /** True when the streak is still alive but today has no activity yet. */
  atRisk: boolean;
}

export interface DailyState {
  /** Progress counters keyed by local date, then activity. */
  days: Record<string, Partial<Record<PlanActivity, number>>>;
  best: number;
}

export const ACTIVITY_META: Record<PlanActivity, { label: string; emoji: string; defaultTarget: number }> = {
  read: { label: 'Read a passage', emoji: '📖', defaultTarget: 1 },
  'practice-words': { label: 'Practise tricky words', emoji: '💪', defaultTarget: 5 },
  'sight-words': { label: 'Sight words', emoji: '⚡', defaultTarget: 10 },
  spelling: { label: 'Spelling', emoji: '✏️', defaultTarget: 6 },
  'math-facts': { label: 'Math facts', emoji: '🧮', defaultTarget: 10 },
  'word-problems': { label: 'Word problems', emoji: '🧠', defaultTarget: 3 },
};

/** Local `YYYY-MM-DD` for a date — not UTC, so the day rolls at local midnight. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Days between two `YYYY-MM-DD` keys, calendar-wise. */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

function parseDailyState(raw: unknown): DailyState {
  const source = (raw ?? {}) as Partial<DailyState>;
  const days: DailyState['days'] = {};
  for (const [dateKey, counters] of Object.entries(source.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !counters || typeof counters !== 'object') continue;
    const clean: Partial<Record<PlanActivity, number>> = {};
    for (const [activity, count] of Object.entries(counters)) {
      if (activity in ACTIVITY_META && typeof count === 'number' && count > 0) {
        clean[activity as PlanActivity] = Math.floor(count);
      }
    }
    if (Object.keys(clean).length > 0) days[dateKey] = clean;
  }
  return { days, best: typeof source.best === 'number' && source.best > 0 ? Math.floor(source.best) : 0 };
}

const store = createScopedStore<DailyState>({
  key: 'daily',
  docType: 'daily',
  empty: () => ({ days: {}, best: 0 }),
  parse: parseDailyState,
});

export function loadDailyState(uid: string | null | undefined): Promise<DailyState> {
  return store.load(uid);
}

export function loadDailyStateLocal(uid: string | null | undefined): DailyState {
  return store.readLocal(uid);
}

/** Fold one completed unit of work into the state (pure). */
export function applyActivity(
  state: DailyState,
  activity: PlanActivity,
  amount = 1,
  now: Date = new Date(),
): DailyState {
  if (amount <= 0) return state;
  const key = localDateKey(now);
  const day = state.days[key] ?? {};
  const next: DailyState = {
    ...state,
    days: { ...state.days, [key]: { ...day, [activity]: (day[activity] ?? 0) + amount } },
  };
  const streak = computeStreak(next, now);
  return { ...next, best: Math.max(next.best, streak.current) };
}

/** Record work done and persist. */
export function recordActivity(
  uid: string | null | undefined,
  activity: PlanActivity,
  amount = 1,
  now: Date = new Date(),
): Promise<DailyState> {
  return store.update(uid, (state) => applyActivity(state, activity, amount, now));
}

/**
 * Current and best streak.
 *
 * Today counts only once there is activity, but a streak that ran through
 * *yesterday* is still alive — it is `atRisk` rather than broken, which is the
 * state worth showing on the home screen.
 */
export function computeStreak(state: DailyState, now: Date = new Date()): StreakState {
  const activeDays = Object.entries(state.days)
    .filter(([, counters]) => Object.values(counters).some((count) => (count ?? 0) > 0))
    .map(([key]) => key)
    .sort();

  if (activeDays.length === 0) {
    return { current: 0, best: state.best, lastActiveDate: null, atRisk: false };
  }

  const today = localDateKey(now);
  const lastActiveDate = activeDays[activeDays.length - 1];
  const gap = daysBetween(lastActiveDate, today);

  // A gap of more than one day means the streak is over.
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = activeDays.length - 1; i > 0; i -= 1) {
      if (daysBetween(activeDays[i - 1], activeDays[i]) === 1) current += 1;
      else break;
    }
  }

  return {
    current,
    best: Math.max(state.best, current),
    lastActiveDate,
    atRisk: gap === 1 && current > 0,
  };
}

export interface PlanOptions {
  /** Activities to include, in order. */
  activities: PlanActivity[];
  /** Per-activity target overrides. */
  targets?: Partial<Record<PlanActivity, number>>;
  now?: Date;
}

/** Build today's plan with live completion counts. */
export function buildDailyGoal(state: DailyState, { activities, targets, now = new Date() }: PlanOptions): DailyGoal {
  const date = localDateKey(now);
  const today = state.days[date] ?? {};

  const tasks: PlanTask[] = activities.map((activity) => {
    const meta = ACTIVITY_META[activity];
    const target = Math.max(1, targets?.[activity] ?? meta.defaultTarget);
    const completed = today[activity] ?? 0;
    return { activity, label: meta.label, emoji: meta.emoji, target, completed, done: completed >= target };
  });

  const completedCount = tasks.filter((task) => task.done).length;
  return {
    date,
    tasks,
    completedCount,
    totalCount: tasks.length,
    percent: tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100),
    allDone: tasks.length > 0 && completedCount === tasks.length,
  };
}

/**
 * The default plan for a learner.
 *
 * Younger children get a shorter list — three things a six-year-old can
 * actually finish beats six they will abandon.
 */
export function defaultPlanActivities(gradeIsEarly: boolean): PlanActivity[] {
  return gradeIsEarly
    ? ['read', 'sight-words', 'math-facts']
    : ['read', 'practice-words', 'math-facts', 'word-problems'];
}

/** Activity counts for the last `days` days, oldest first — for a sparkline. */
export function recentActivityCounts(state: DailyState, days: number, now: Date = new Date()): Array<{ date: string; count: number }> {
  const out: Array<{ date: string; count: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDateKey(date);
    const counters = state.days[key] ?? {};
    out.push({ date: key, count: Object.values(counters).reduce((sum, value) => sum + (value ?? 0), 0) });
  }
  return out;
}
