import { describe, it, expect } from 'vitest';
import { buildParentReport, reportWindow, wordsToWatch } from '../services/parentReportService';
import { applyFactResult, factId, type FactState } from '../services/mathFactService';
import { applyActivity, type DailyState } from '../services/dailyPlanService';
import { createSrsItem, reviewSrsItem, type SrsCollection } from '../services/srsService';
import type { SessionRecord } from '../services/progressService';
import type { MathSessionRecord } from '../services/mathService';

const NOW = new Date(2026, 2, 10, 12, 0, 0);
const daysAgo = (n: number) => new Date(2026, 2, 10 - n, 12, 0, 0).toISOString();

function readingSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1', date: daysAgo(1), title: 'A story', score: 80, stars: 4, accuracy: 90,
    wordCount: 120, hardWordCount: 5, hardWordCorrect: 4, wordsNeedPractice: ['because'],
    ...overrides,
  };
}

function mathSession(overrides: Partial<MathSessionRecord> = {}): MathSessionRecord {
  return {
    id: 'm1', date: daysAgo(1), grade: '3', skillId: 'multiply-10', skillName: 'Times Tables',
    accuracy: 80, correctCount: 8, questionCount: 10, averageResponseMs: 3000, responses: [],
    ...overrides,
  };
}

function masteredCollection(words: string[]): SrsCollection {
  const collection: SrsCollection = {};
  for (const word of words) {
    let item = createSrsItem(word, NOW);
    for (let i = 0; i < 5; i += 1) item = reviewSrsItem(item, true, NOW);
    collection[word] = item;
  }
  return collection;
}

const emptyFacts: FactState = { srs: {}, stats: {} };
const emptyDaily: DailyState = { days: {}, best: 0 };

function baseInput() {
  return {
    learnerName: 'Maya',
    grade: '3' as const,
    readingSessions: [readingSession()],
    mathSessions: [mathSession()],
    factState: emptyFacts,
    sightWords: {} as SrsCollection,
    spellingWords: {} as SrsCollection,
    dailyState: emptyDaily,
    now: NOW,
  };
}

describe('reportWindow', () => {
  it('covers the requested number of days ending now', () => {
    const window = reportWindow(NOW, 7);
    expect(window.to.getTime()).toBe(NOW.getTime());
    expect(window.from.getDate()).toBe(4);
  });
});

describe('wordsToWatch', () => {
  it('ranks the most frequently missed words first', () => {
    const sessions = [
      readingSession({ wordsNeedPractice: ['because', 'through'] }),
      readingSession({ wordsNeedPractice: ['because'] }),
    ];
    expect(wordsToWatch(sessions)[0]).toBe('because');
  });

  it('normalises case and ignores blanks', () => {
    const sessions = [readingSession({ wordsNeedPractice: ['Because', 'because', '  '] })];
    expect(wordsToWatch(sessions)).toEqual(['because']);
  });

  it('respects the limit', () => {
    const sessions = [readingSession({ wordsNeedPractice: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] })];
    expect(wordsToWatch(sessions, 3)).toHaveLength(3);
  });

  it('returns nothing when there is nothing to watch', () => {
    expect(wordsToWatch([])).toEqual([]);
  });
});

describe('buildParentReport', () => {
  it('summarises reading and math in the window', () => {
    const report = buildParentReport(baseInput());
    expect(report.readingSessions).toBe(1);
    expect(report.wordsRead).toBe(120);
    expect(report.averageScore).toBe(80);
    expect(report.mathQuestions).toBe(10);
    expect(report.mathAccuracy).toBe(80);
  });

  it('excludes activity from before the window', () => {
    const report = buildParentReport({
      ...baseInput(),
      readingSessions: [readingSession({ date: daysAgo(30) })],
      mathSessions: [mathSession({ date: daysAgo(30) })],
    });
    expect(report.readingSessions).toBe(0);
    expect(report.mathSessions).toBe(0);
  });

  it('reports a fluency benchmark when WCPM data exists', () => {
    const report = buildParentReport({ ...baseInput(), wcpmBySession: [100, 120, 110] });
    expect(report.fluencyWcpm).toBe(110);
    expect(report.fluency?.grade).toBe('3');
  });

  it('omits fluency when no rates were captured', () => {
    const report = buildParentReport(baseInput());
    expect(report.fluencyWcpm).toBeNull();
    expect(report.fluency).toBeNull();
  });

  it('counts fluent multiplication facts', () => {
    let facts = emptyFacts;
    for (let i = 0; i < 6; i += 1) facts = applyFactResult(facts, factId('mul', 2, 3), true, 1000, NOW);
    const report = buildParentReport({ ...baseInput(), factState: facts });
    expect(report.factsFluent).toBe(1);
    expect(report.factsTotal).toBeGreaterThan(1);
  });

  it('counts mastered sight and spelling words', () => {
    const report = buildParentReport({
      ...baseInput(),
      sightWords: masteredCollection(['the', 'and']),
      spellingWords: masteredCollection(['cake']),
    });
    expect(report.sightWordsMastered).toBe(2);
    expect(report.spellingWordsMastered).toBe(1);
  });

  it('counts active days inside the window only', () => {
    let daily = applyActivity(emptyDaily, 'read', 1, new Date(2026, 2, 9, 12));
    daily = applyActivity(daily, 'read', 1, new Date(2026, 2, 10, 12));
    daily = applyActivity(daily, 'read', 1, new Date(2026, 1, 1, 12)); // long before the window
    expect(buildParentReport({ ...baseInput(), dailyState: daily }).activeDays).toBe(2);
  });

  it('counts today even when the report runs early in the morning', () => {
    // Regression: comparing a nominal midday against a "now" bound of 06:00
    // silently dropped the current day's work from the report.
    const earlyMorning = new Date(2026, 2, 10, 6, 0, 0);
    const daily = applyActivity(emptyDaily, 'read', 1, earlyMorning);
    const report = buildParentReport({ ...baseInput(), dailyState: daily, now: earlyMorning });
    expect(report.activeDays).toBe(1);
  });

  it('counts activity recorded late at night on the last day of the window', () => {
    const lateNight = new Date(2026, 2, 10, 23, 45, 0);
    const daily = applyActivity(emptyDaily, 'read', 1, lateNight);
    expect(buildParentReport({ ...baseInput(), dailyState: daily, now: lateNight }).activeDays).toBe(1);
  });

  it('always produces at least one highlight and one suggestion', () => {
    const empty = buildParentReport({ ...baseInput(), readingSessions: [], mathSessions: [] });
    expect(empty.highlights.length).toBeGreaterThan(0);
    expect(empty.suggestions.length).toBeGreaterThan(0);
  });

  it('says so plainly when there was no activity', () => {
    const report = buildParentReport({ ...baseInput(), readingSessions: [], mathSessions: [] });
    expect(report.highlights[0]).toContain('No activity');
  });

  it('suggests practising the words the child keeps missing', () => {
    const report = buildParentReport(baseInput());
    expect(report.wordsToWatch).toContain('because');
    expect(report.suggestions.join(' ')).toContain('because');
  });

  it('nudges towards more sessions when the week was thin', () => {
    expect(buildParentReport(baseInput()).suggestions.join(' ')).toContain('three short sessions');
  });

  it('does not nudge when the child practised most days', () => {
    let daily = emptyDaily;
    for (let i = 0; i < 5; i += 1) daily = applyActivity(daily, 'read', 1, new Date(2026, 2, 10 - i, 12));
    const report = buildParentReport({ ...baseInput(), dailyState: daily });
    expect(report.suggestions.join(' ')).not.toContain('three short sessions');
  });

  it('handles a completely empty learner without dividing by zero', () => {
    const report = buildParentReport({
      learnerName: 'New', grade: '1', readingSessions: [], mathSessions: [],
      factState: emptyFacts, sightWords: {}, spellingWords: {}, dailyState: emptyDaily, now: NOW,
    });
    expect(report.averageScore).toBe(0);
    expect(report.mathAccuracy).toBe(0);
    expect(report.activeDays).toBe(0);
  });
});
