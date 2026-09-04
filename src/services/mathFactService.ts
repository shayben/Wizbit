/**
 * Per-fact math mastery.
 *
 * `mathService` adapts by *topic*: it moves a child up or down the skill list
 * based on last-session accuracy, and generates items uniformly at random
 * inside a skill. That means a third grader who owns ×2 and ×5 but stumbles on
 * ×7 and ×8 keeps drawing all facts equally.
 *
 * This module models each fact individually. A fact is mastered only when it
 * is both *accurate* and *fast* — for basic facts, latency is the mastery
 * signal, because recall and re-derivation look identical on an accuracy-only
 * measure. Selection is driven by the shared spaced-repetition core, so the
 * shakiest facts come round most often.
 */

import { createScopedStore } from './scopedStore';
import {
  buildReviewQueue,
  isSrsMastered,
  parseSrsCollection,
  recordSrsReview,
  type SrsCollection,
} from './srsService';

export type FactOperation = 'add' | 'sub' | 'mul' | 'div';

export interface MathFact {
  /** Stable id, e.g. `mul:7x8`. */
  id: string;
  operation: FactOperation;
  left: number;
  right: number;
  answer: number;
  prompt: string;
}

/** Per-fact performance, independent of the SRS schedule. */
export interface FactStat {
  attempts: number;
  correct: number;
  /** Median-ish response time: an exponential moving average, in ms. */
  averageMs: number;
  /** Fastest correct response seen, in ms. */
  bestMs: number;
  lastSeenAt: string;
}

export interface FactState {
  srs: SrsCollection;
  stats: Record<string, FactStat>;
}

export type FactMasteryLevel = 'new' | 'learning' | 'accurate' | 'fluent';

export interface FactMastery {
  factId: string;
  level: FactMasteryLevel;
  attempts: number;
  accuracy: number;
  averageMs: number;
}

/**
 * A fact counts as *fluent* when it is answered correctly within this many
 * milliseconds — the widely used "three seconds means recall, not counting"
 * threshold for basic facts.
 */
export const FLUENT_MS = 3000;

/** Attempts needed before a fact can be judged at all. */
export const MIN_ATTEMPTS_FOR_MASTERY = 3;

/** Smoothing factor for the response-time moving average. */
const EMA_ALPHA = 0.4;

const OPERATION_META: Record<FactOperation, { symbol: string; label: string; emoji: string }> = {
  add: { symbol: '+', label: 'Addition', emoji: '➕' },
  sub: { symbol: '−', label: 'Subtraction', emoji: '➖' },
  mul: { symbol: '×', label: 'Multiplication', emoji: '✖️' },
  div: { symbol: '÷', label: 'Division', emoji: '➗' },
};

export function operationMeta(operation: FactOperation) {
  return OPERATION_META[operation];
}

export function factId(operation: FactOperation, left: number, right: number): string {
  return `${operation}:${left}x${right}`;
}

export function makeFact(operation: FactOperation, left: number, right: number): MathFact {
  const { symbol } = OPERATION_META[operation];
  switch (operation) {
    case 'add':
      return { id: factId('add', left, right), operation, left, right, answer: left + right, prompt: `${left} ${symbol} ${right} = ?` };
    case 'sub':
      // Presented as (left + right) − right so the answer is never negative.
      return { id: factId('sub', left, right), operation, left, right, answer: left, prompt: `${left + right} ${symbol} ${right} = ?` };
    case 'mul':
      return { id: factId('mul', left, right), operation, left, right, answer: left * right, prompt: `${left} ${symbol} ${right} = ?` };
    case 'div':
      // Presented as (left × right) ÷ right so the quotient is always whole.
      return { id: factId('div', left, right), operation, left, right, answer: left, prompt: `${left * right} ${symbol} ${right} = ?` };
  }
}

/** Every fact in a square table, e.g. the 10×10 multiplication grid. */
export function buildFactTable(operation: FactOperation, max: number, min = 0): MathFact[] {
  const facts: MathFact[] = [];
  const lo = operation === 'div' ? Math.max(1, min) : min;
  const hi = Math.max(lo, max);
  for (let left = lo; left <= hi; left += 1) {
    for (let right = lo; right <= hi; right += 1) {
      facts.push(makeFact(operation, left, right));
    }
  }
  return facts;
}

/** Table configurations offered per operation. */
export const FACT_TABLES: Record<FactOperation, { max: number; min: number }> = {
  add: { min: 0, max: 10 },
  sub: { min: 0, max: 10 },
  mul: { min: 0, max: 10 },
  div: { min: 1, max: 10 },
};

export function factsForOperation(operation: FactOperation): MathFact[] {
  const { min, max } = FACT_TABLES[operation];
  return buildFactTable(operation, max, min);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function parseFactState(raw: unknown): FactState {
  const source = (raw ?? {}) as Partial<FactState>;
  const stats: Record<string, FactStat> = {};
  for (const [key, value] of Object.entries(source.stats ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const stat = value as Partial<FactStat>;
    if (typeof stat.attempts !== 'number') continue;
    stats[key] = {
      attempts: Math.max(0, stat.attempts),
      correct: typeof stat.correct === 'number' ? Math.max(0, stat.correct) : 0,
      averageMs: typeof stat.averageMs === 'number' && stat.averageMs > 0 ? stat.averageMs : 0,
      bestMs: typeof stat.bestMs === 'number' && stat.bestMs > 0 ? stat.bestMs : 0,
      lastSeenAt: typeof stat.lastSeenAt === 'string' ? stat.lastSeenAt : new Date(0).toISOString(),
    };
  }
  return { srs: parseSrsCollection(source.srs), stats };
}

const store = createScopedStore<FactState>({
  key: 'math_facts',
  docType: 'mathFacts',
  empty: () => ({ srs: {}, stats: {} }),
  parse: parseFactState,
});

export function loadFactState(uid: string | null | undefined): Promise<FactState> {
  return store.load(uid);
}

export function loadFactStateLocal(uid: string | null | undefined): FactState {
  return store.readLocal(uid);
}

/** Fold one answered fact into the state (pure — no I/O). */
export function applyFactResult(
  state: FactState,
  id: string,
  correct: boolean,
  responseMs: number,
  now: Date = new Date(),
): FactState {
  const previous = state.stats[id];
  const clampedMs = Number.isFinite(responseMs) && responseMs > 0 ? responseMs : 0;

  const averageMs = !previous || previous.averageMs === 0
    ? clampedMs
    : Math.round(previous.averageMs * (1 - EMA_ALPHA) + clampedMs * EMA_ALPHA);

  const bestMs = correct && clampedMs > 0
    ? previous?.bestMs
      ? Math.min(previous.bestMs, clampedMs)
      : clampedMs
    : previous?.bestMs ?? 0;

  return {
    srs: recordSrsReview(state.srs, id, correct, now),
    stats: {
      ...state.stats,
      [id]: {
        attempts: (previous?.attempts ?? 0) + 1,
        correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
        averageMs,
        bestMs,
        lastSeenAt: now.toISOString(),
      },
    },
  };
}

/** Record an answered fact and persist it. */
export async function recordFactResult(
  uid: string | null | undefined,
  id: string,
  correct: boolean,
  responseMs: number,
  now: Date = new Date(),
): Promise<FactState> {
  return store.update(uid, (state) => applyFactResult(state, id, correct, responseMs, now));
}

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

/**
 * Classify one fact.
 *
 * `accurate` and `fluent` are deliberately separate: getting 7×8 right after
 * eight seconds of skip-counting is real progress, but it is not yet the
 * instant recall that frees up working memory for multi-step problems.
 */
export function factMastery(state: FactState, id: string): FactMastery {
  const stat = state.stats[id];
  if (!stat || stat.attempts === 0) {
    return { factId: id, level: 'new', attempts: 0, accuracy: 0, averageMs: 0 };
  }

  const accuracy = Math.round((stat.correct / stat.attempts) * 100);
  const srsItem = state.srs[id];
  const enoughAttempts = stat.attempts >= MIN_ATTEMPTS_FOR_MASTERY;

  let level: FactMasteryLevel;
  if (!enoughAttempts || accuracy < 60) {
    level = 'learning';
  } else if (accuracy >= 80 && stat.averageMs > 0 && stat.averageMs <= FLUENT_MS && (srsItem ? isSrsMastered(srsItem) : false)) {
    level = 'fluent';
  } else if (accuracy >= 80) {
    level = 'accurate';
  } else {
    level = 'learning';
  }

  return { factId: id, level, attempts: stat.attempts, accuracy, averageMs: stat.averageMs };
}

export interface FactTableSummary {
  operation: FactOperation;
  total: number;
  fluent: number;
  accurate: number;
  learning: number;
  untouched: number;
  /** Percentage of the table that is fluent, 0–100. */
  fluentPercent: number;
  /** The facts most in need of work, weakest first. */
  weakest: FactMastery[];
}

export function summarizeFactTable(
  state: FactState,
  operation: FactOperation,
  weakestCount = 6,
): FactTableSummary {
  const facts = factsForOperation(operation);
  const rows = facts.map((fact) => factMastery(state, fact.id));

  const counts = { fluent: 0, accurate: 0, learning: 0, untouched: 0 };
  for (const row of rows) {
    if (row.level === 'fluent') counts.fluent += 1;
    else if (row.level === 'accurate') counts.accurate += 1;
    else if (row.level === 'learning') counts.learning += 1;
    else counts.untouched += 1;
  }

  const weakest = rows
    .filter((row) => row.level === 'learning' || row.level === 'accurate')
    .sort((a, b) => a.accuracy - b.accuracy || b.averageMs - a.averageMs)
    .slice(0, weakestCount);

  return {
    operation,
    total: rows.length,
    ...counts,
    fluentPercent: rows.length === 0 ? 0 : Math.round((counts.fluent / rows.length) * 100),
    weakest,
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface FactDrillOptions {
  state: FactState;
  operation: FactOperation;
  size: number;
  now?: Date;
  /** Restrict to one times-table row, e.g. 7 for the sevens. */
  focusFactor?: number;
}

/**
 * Choose the next facts to drill.
 *
 * Candidate order matters: facts are offered easiest-first (small operands,
 * commuted duplicates last) so a learner meeting a table for the first time
 * starts somewhere winnable, while the SRS layer pulls shaky facts forward.
 */
export function buildFactDrill({ state, operation, size, now = new Date(), focusFactor }: FactDrillOptions): MathFact[] {
  const all = factsForOperation(operation);
  const pool = focusFactor === undefined
    ? all
    : all.filter((fact) => fact.left === focusFactor || fact.right === focusFactor);

  const ordered = [...pool].sort((a, b) => {
    const aWeight = a.left + a.right + Math.max(a.left, a.right);
    const bWeight = b.left + b.right + Math.max(b.left, b.right);
    return aWeight - bWeight || a.id.localeCompare(b.id);
  });

  const byId = new Map(ordered.map((fact) => [fact.id, fact]));
  const queue = buildReviewQueue({
    collection: state.srs,
    candidateIds: ordered.map((fact) => fact.id),
    limit: size,
    now,
    maxNew: Math.max(1, Math.ceil(size / 2)),
  });

  return queue.map((id) => byId.get(id)!).filter(Boolean);
}

/** Rows of a square fact table, for the mastery grid display. */
export function factGrid(state: FactState, operation: FactOperation): FactMastery[][] {
  const { min, max } = FACT_TABLES[operation];
  const rows: FactMastery[][] = [];
  for (let left = min; left <= max; left += 1) {
    const row: FactMastery[] = [];
    for (let right = min; right <= max; right += 1) {
      row.push(factMastery(state, factId(operation, left, right)));
    }
    rows.push(row);
  }
  return rows;
}
