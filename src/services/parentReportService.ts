/**
 * Weekly parent report.
 *
 * Pure aggregation over data the other services already collect. It answers
 * the questions a parent actually asks — did they practise, is it getting
 * easier, what is still shaky — and names concrete next steps rather than
 * showing another chart.
 */

import type { SessionRecord } from './progressService';
import type { MathSessionRecord } from './mathService';
import type { SrsCollection } from './srsService';
import { isSrsMastered } from './srsService';
import { benchmarkFluency, type FluencyBenchmark } from './fluencyService';
import { summarizeFactTable, type FactState } from './mathFactService';
import { computeStreak, localDateKey, type DailyState } from './dailyPlanService';
import type { GradeCode } from '../types/grade';

export interface ReportWindow {
  /** Inclusive start of the reporting window. */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

export interface ParentReport {
  learnerName: string;
  grade: GradeCode;
  window: ReportWindow;

  readingSessions: number;
  wordsRead: number;
  averageScore: number;
  /** Median WCPM across sessions that recorded one, or null. */
  fluencyWcpm: number | null;
  fluency: FluencyBenchmark | null;

  mathSessions: number;
  mathQuestions: number;
  mathAccuracy: number;
  factsFluent: number;
  factsTotal: number;

  sightWordsMastered: number;
  spellingWordsMastered: number;

  activeDays: number;
  currentStreak: number;

  /** Words the child is still missing most often. */
  wordsToWatch: string[];
  /** Plain-language highlights, most encouraging first. */
  highlights: string[];
  /** Concrete things a parent can do this week. */
  suggestions: string[];
}

export interface ReportInput {
  learnerName: string;
  grade: GradeCode;
  readingSessions: SessionRecord[];
  mathSessions: MathSessionRecord[];
  factState: FactState;
  sightWords: SrsCollection;
  spellingWords: SrsCollection;
  dailyState: DailyState;
  /** Per-session WCPM values, if the caller has them. */
  wcpmBySession?: number[];
  now?: Date;
  /** Length of the reporting window in days. */
  days?: number;
}

/** The last `days` days, ending now. */
export function reportWindow(now: Date, days: number): ReportWindow {
  const to = new Date(now.getTime());
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  return { from, to };
}

function withinWindow(iso: string, window: ReportWindow): boolean {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time >= window.from.getTime() && time <= window.to.getTime();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function countMastered(collection: SrsCollection): number {
  return Object.values(collection).filter(isSrsMastered).length;
}

/** Words missed most often across the window's reading sessions. */
export function wordsToWatch(sessions: SessionRecord[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const word of session.wordsNeedPractice ?? []) {
      const clean = word.trim().toLowerCase();
      if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

/**
 * Build the weekly report.
 *
 * Every field is derived; nothing here reads storage, so the report is easy to
 * test and can be rendered for any window the caller asks for.
 */
export function buildParentReport({
  learnerName,
  grade,
  readingSessions,
  mathSessions,
  factState,
  sightWords,
  spellingWords,
  dailyState,
  wcpmBySession = [],
  now = new Date(),
  days = 7,
}: ReportInput): ParentReport {
  const window = reportWindow(now, days);

  const reading = readingSessions.filter((session) => withinWindow(session.date, window));
  const math = mathSessions.filter((session) => withinWindow(session.date, window));

  const wordsRead = reading.reduce((sum, session) => sum + (session.wordCount ?? 0), 0);
  const averageScore = reading.length === 0
    ? 0
    : Math.round(reading.reduce((sum, session) => sum + session.score, 0) / reading.length);

  const mathQuestions = math.reduce((sum, session) => sum + session.questionCount, 0);
  const mathCorrect = math.reduce((sum, session) => sum + session.correctCount, 0);
  const mathAccuracy = mathQuestions === 0 ? 0 : Math.round((mathCorrect / mathQuestions) * 100);

  const factSummary = summarizeFactTable(factState, 'mul');
  const fluencyWcpm = median(wcpmBySession.filter((value) => Number.isFinite(value) && value > 0));
  const fluency = fluencyWcpm === null ? null : benchmarkFluency(fluencyWcpm, grade);

  // Compare day *keys*, not timestamps: a day is in the window or it is not.
  // Comparing a nominal time-of-day against `to` would drop today's activity
  // whenever the report is generated earlier in the day than that nominal time.
  const windowKeys = new Set<string>();
  for (let offset = 0; offset < days; offset += 1) {
    windowKeys.add(localDateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset),
    ));
  }

  const activeDays = Object.entries(dailyState.days).filter(([key, counters]) =>
    windowKeys.has(key) && Object.values(counters).some((count) => (count ?? 0) > 0),
  ).length;

  const streak = computeStreak(dailyState, now);
  const watch = wordsToWatch(reading);
  const sightWordsMastered = countMastered(sightWords);
  const spellingWordsMastered = countMastered(spellingWords);

  const highlights: string[] = [];
  if (reading.length > 0) {
    highlights.push(`Read ${reading.length} passage${reading.length === 1 ? '' : 's'} — ${wordsRead.toLocaleString()} words.`);
  }
  if (fluency && fluencyWcpm !== null) {
    highlights.push(`Reading at ${fluencyWcpm} words per minute (${fluency.label.toLowerCase()} for grade ${grade}).`);
  }
  if (mathQuestions > 0) {
    highlights.push(`Answered ${mathQuestions} math question${mathQuestions === 1 ? '' : 's'} at ${mathAccuracy}% accuracy.`);
  }
  if (factSummary.fluent > 0) {
    highlights.push(`${factSummary.fluent} of ${factSummary.total} multiplication facts are now instant recall.`);
  }
  if (sightWordsMastered > 0) {
    highlights.push(`${sightWordsMastered} sight words mastered.`);
  }
  if (streak.current > 1) {
    highlights.push(`On a ${streak.current}-day streak.`);
  }
  if (highlights.length === 0) {
    highlights.push('No activity recorded this week yet.');
  }

  const suggestions: string[] = [];
  if (watch.length > 0) {
    suggestions.push(`Practise these words together: ${watch.slice(0, 3).join(', ')}.`);
  }
  if (factSummary.weakest.length > 0) {
    const facts = factSummary.weakest.slice(0, 3).map((row) => row.factId.replace('mul:', '').replace('x', ' × '));
    suggestions.push(`Shakiest math facts right now: ${facts.join(', ')}.`);
  }
  if (activeDays < 3) {
    suggestions.push('Aim for three short sessions this week — little and often beats one long one.');
  }
  if (fluency && (fluency.band === 'building' || fluency.band === 'approaching')) {
    suggestions.push('Re-reading a favourite page two or three times is the fastest way to build reading speed.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Everything looks on track — keep doing what you are doing.');
  }

  return {
    learnerName,
    grade,
    window,
    readingSessions: reading.length,
    wordsRead,
    averageScore,
    fluencyWcpm,
    fluency,
    mathSessions: math.length,
    mathQuestions,
    mathAccuracy,
    factsFluent: factSummary.fluent,
    factsTotal: factSummary.total,
    sightWordsMastered,
    spellingWordsMastered,
    activeDays,
    currentStreak: streak.current,
    wordsToWatch: watch,
    highlights,
    suggestions,
  };
}
