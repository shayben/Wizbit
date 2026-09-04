/**
 * Spaced-repetition core.
 *
 * A single Leitner-style scheduler shared by every drill in the app —
 * reading practice words, sight words, spelling dictation and math facts.
 * The service stores *scheduling state only*, keyed by an opaque item id, so
 * each caller keeps ownership of its own content (the word, the fact, the
 * question) and simply asks this module what to show next.
 *
 * Boxes advance on a correct answer and drop back on a miss. A missed item is
 * always rescheduled for the current session rather than days later, which is
 * what young learners need: see it again while the correction is still fresh.
 */

/** Scheduling state for one drillable item. */
export interface SrsItem {
  /** Caller-owned identifier (a word, a fact key, a question id). */
  id: string;
  /** Leitner box index; higher means seen correctly more often. */
  box: number;
  /** Total reviews recorded. */
  reps: number;
  /** Times the item dropped back a box after being promoted at least once. */
  lapses: number;
  /** Consecutive correct answers. */
  streak: number;
  /** ISO timestamp when the item becomes reviewable again. */
  dueAt: string;
  /** ISO timestamp of the most recent review, or null when never reviewed. */
  lastReviewedAt: string | null;
}

export type SrsCollection = Record<string, SrsItem>;

/**
 * Hours until an item in each box comes due again.
 * Box 0 is "relearning" — due immediately, so misses come back this session.
 */
export const BOX_INTERVAL_HOURS = [0, 20, 44, 92, 188, 380];

/** Box index at which an item counts as mastered. */
export const MASTERY_BOX = 4;

/** Highest box an item can reach. */
export const MAX_BOX = BOX_INTERVAL_HOURS.length - 1;

const HOUR_MS = 60 * 60 * 1000;

function toTime(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : 0;
}

function dueFromBox(box: number, now: Date): string {
  const hours = BOX_INTERVAL_HOURS[Math.max(0, Math.min(MAX_BOX, box))] ?? 0;
  return new Date(now.getTime() + hours * HOUR_MS).toISOString();
}

/** Create a fresh, immediately-due item. */
export function createSrsItem(id: string, now: Date = new Date()): SrsItem {
  return {
    id,
    box: 0,
    reps: 0,
    lapses: 0,
    streak: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
  };
}

/**
 * Record a review outcome and return the rescheduled item.
 *
 * Correct → promote one box (capped at {@link MAX_BOX}).
 * Incorrect → drop to box 0 (due immediately) and count a lapse if the item
 * had previously been promoted.
 */
export function reviewSrsItem(item: SrsItem, correct: boolean, now: Date = new Date()): SrsItem {
  const box = correct ? Math.min(MAX_BOX, item.box + 1) : 0;
  return {
    ...item,
    box,
    reps: item.reps + 1,
    lapses: item.lapses + (!correct && item.box > 0 ? 1 : 0),
    streak: correct ? item.streak + 1 : 0,
    dueAt: dueFromBox(box, now),
    lastReviewedAt: now.toISOString(),
  };
}

/** Apply a review to a collection, creating the item if it is not tracked yet. */
export function recordSrsReview(
  collection: SrsCollection,
  id: string,
  correct: boolean,
  now: Date = new Date(),
): SrsCollection {
  const existing = collection[id] ?? createSrsItem(id, now);
  return { ...collection, [id]: reviewSrsItem(existing, correct, now) };
}

export function isSrsDue(item: SrsItem, now: Date = new Date()): boolean {
  return toTime(item.dueAt) <= now.getTime();
}

export function isSrsMastered(item: SrsItem): boolean {
  return item.box >= MASTERY_BOX;
}

/**
 * Items that are due now, most overdue first. Items that have lapsed more
 * often are surfaced ahead of equally-overdue ones so the shakiest material
 * gets the most exposure.
 */
export function selectDueItems(
  collection: SrsCollection,
  now: Date = new Date(),
  limit = Number.POSITIVE_INFINITY,
): SrsItem[] {
  return Object.values(collection)
    .filter((item) => isSrsDue(item, now))
    .sort((a, b) => {
      const byDue = toTime(a.dueAt) - toTime(b.dueAt);
      if (byDue !== 0) return byDue;
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      return a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(0, limit));
}

export interface ReviewQueueOptions {
  /** Existing scheduling state. */
  collection: SrsCollection;
  /** Every id the caller could serve, in its own preferred (e.g. easiest-first) order. */
  candidateIds: string[];
  /** Target queue length. */
  limit: number;
  now?: Date;
  /**
   * Soft cap on how many never-seen items may enter one queue, so new material
   * does not crowd out reviews. Defaults to a third of `limit` (at least one).
   * The cap is lifted when there is nothing else left to fill the queue with.
   */
  maxNew?: number;
}

/**
 * Build a drill queue: due review items first, topped up with new material.
 *
 * Only candidate ids are ever returned, so callers can retire content (a
 * cleared practice word, a fact outside the current grade) simply by leaving
 * it out of `candidateIds`.
 */
export function buildReviewQueue({
  collection,
  candidateIds,
  limit,
  now = new Date(),
  maxNew,
}: ReviewQueueOptions): string[] {
  if (limit <= 0) return [];
  const allowed = new Set(candidateIds);
  const newCap = maxNew ?? Math.max(1, Math.floor(limit / 3));

  const due = selectDueItems(collection, now)
    .filter((item) => allowed.has(item.id))
    .map((item) => item.id);

  const queue = due.slice(0, limit);
  const chosen = new Set(queue);

  let added = 0;
  for (const id of candidateIds) {
    if (queue.length >= limit || added >= newCap) break;
    if (chosen.has(id) || collection[id]) continue;
    queue.push(id);
    chosen.add(id);
    added += 1;
  }

  // Still short — top up with not-yet-due items, least-practised first.
  if (queue.length < limit) {
    const fillers = candidateIds
      .filter((id) => !chosen.has(id) && collection[id])
      .sort((a, b) => collection[a].box - collection[b].box);
    for (const id of fillers) {
      if (queue.length >= limit) break;
      queue.push(id);
      chosen.add(id);
    }
  }

  // Still short because there is simply nothing else to review — lift the new
  // cap rather than hand back a short session. The cap exists to keep new
  // material from crowding out reviews, not to starve a fresh learner.
  if (queue.length < limit) {
    for (const id of candidateIds) {
      if (queue.length >= limit) break;
      if (chosen.has(id)) continue;
      queue.push(id);
      chosen.add(id);
    }
  }

  return queue;
}

export interface SrsSummary {
  tracked: number;
  due: number;
  learning: number;
  mastered: number;
  /** Share of tracked items that are mastered, 0–100. */
  masteryPercent: number;
}

export function summarizeSrs(collection: SrsCollection, now: Date = new Date()): SrsSummary {
  const items = Object.values(collection);
  const mastered = items.filter(isSrsMastered).length;
  return {
    tracked: items.length,
    due: items.filter((item) => isSrsDue(item, now)).length,
    learning: items.length - mastered,
    mastered,
    masteryPercent: items.length === 0 ? 0 : Math.round((mastered / items.length) * 100),
  };
}

/** Parse untrusted stored JSON into a valid collection, dropping bad entries. */
export function parseSrsCollection(raw: unknown): SrsCollection {
  if (!raw || typeof raw !== 'object') return {};
  const out: SrsCollection = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<SrsItem>;
    if (typeof candidate.id !== 'string' || typeof candidate.box !== 'number') continue;
    out[key] = {
      id: candidate.id,
      box: Math.max(0, Math.min(MAX_BOX, Math.round(candidate.box))),
      reps: typeof candidate.reps === 'number' ? candidate.reps : 0,
      lapses: typeof candidate.lapses === 'number' ? candidate.lapses : 0,
      streak: typeof candidate.streak === 'number' ? candidate.streak : 0,
      dueAt: typeof candidate.dueAt === 'string' ? candidate.dueAt : new Date(0).toISOString(),
      lastReviewedAt: typeof candidate.lastReviewedAt === 'string' ? candidate.lastReviewedAt : null,
    };
  }
  return out;
}
