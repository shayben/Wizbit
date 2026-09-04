/**
 * FactDrill — per-fact fluency practice with a visible mastery campaign.
 *
 * Where the topic-level practice generates items uniformly at random, this
 * drill draws from the spaced-repetition schedule, so the facts a child keeps
 * missing come round most often. Because latency is part of mastery, the
 * answer surface is a number pad rather than a keyboard: the measurement only
 * means something if entry is not the bottleneck.
 *
 * The grid is the point as much as the drill — 121 cells that fill in turns
 * "practise your times tables" into a target a child can see.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QuizRunner, { type QuizSummary } from './common/QuizRunner';
import NumberPad from './common/NumberPad';
import MasteryGrid from './common/MasteryGrid';
import { LEVEL_STYLE, MASTERY_LEGEND } from './common/masteryLegend';
import ProgressRing from './common/ProgressRing';
import TenFrame from './common/TenFrame';
import NumberLine from './common/NumberLine';
import {
  FLUENT_MS,
  buildFactDrill,
  factGrid,
  loadFactState,
  loadFactStateLocal,
  operationMeta,
  recordFactResult,
  summarizeFactTable,
  type FactOperation,
  type FactState,
  type MathFact,
} from '../services/mathFactService';
import { diagnoseMathError } from '../services/mathErrorService';
import { gradeIndex, type GradeCode } from '../types/grade';

export interface FactDrillProps {
  uid: string | null;
  grade: GradeCode;
  onComplete?: (summary: QuizSummary) => void;
  onExit: () => void;
}

interface FactCardProps {
  fact: MathFact;
  grade: GradeCode;
  answered: boolean;
  onSubmit: (entered: string) => void;
}

/**
 * One fact and its answer pad. Mounted with the fact as its key so the pad
 * always starts empty on a new question.
 */
const FactCard: React.FC<FactCardProps> = ({ fact, grade, answered, onSubmit }) => {
  const [entered, setEntered] = useState('');
  const early = gradeIndex(grade) <= 1;

  return (
    <div className="rounded-3xl border border-violet-100 bg-white p-5 md:p-7 shadow-sm">
      <p className="text-center text-4xl md:text-6xl font-extrabold text-gray-800 mb-5">
        {fact.prompt}
      </p>

      {/* Concrete and representational support for the youngest learners. */}
      {early && fact.operation === 'add' && (
        <div className="mb-5 flex justify-center">
          <TenFrame count={fact.left} secondCount={fact.right} />
        </div>
      )}
      {early && fact.operation === 'sub' && (
        <NumberLine
          min={0}
          max={Math.max(10, fact.left + fact.right)}
          from={fact.left + fact.right}
          to={fact.left}
        />
      )}

      {!answered && (
        <NumberPad
          value={entered}
          onChange={setEntered}
          onSubmit={() => onSubmit(entered)}
          maxLength={4}
        />
      )}
    </div>
  );
};

type Phase = 'overview' | 'drill' | 'results';

const DRILL_SIZE = 10;

/** Operations that make sense at a grade, easiest first. */
function operationsForGrade(grade: GradeCode): FactOperation[] {
  return gradeIndex(grade) <= 1 ? ['add', 'sub'] : ['mul', 'div', 'add', 'sub'];
}

const FactDrill: React.FC<FactDrillProps> = ({ uid, grade, onComplete, onExit }) => {
  const operations = useMemo(() => operationsForGrade(grade), [grade]);
  const [operation, setOperation] = useState<FactOperation>(operations[0]);
  const [state, setState] = useState<FactState>(() => loadFactStateLocal(uid));
  const [phase, setPhase] = useState<Phase>('overview');
  const [facts, setFacts] = useState<MathFact[]>([]);
  /** The value most recently submitted — used to diagnose a wrong answer. */
  const [answer, setAnswer] = useState('');
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [focusFactor, setFocusFactor] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadFactState(uid).then((loaded) => { if (!cancelled) setState(loaded); });
    return () => { cancelled = true; };
  }, [uid]);

  const summaryForTable = useMemo(() => summarizeFactTable(state, operation), [state, operation]);
  const grid = useMemo(() => factGrid(state, operation), [state, operation]);

  const start = useCallback((factor?: number) => {
    setFocusFactor(factor);
    setFacts(buildFactDrill({ state, operation, size: DRILL_SIZE, focusFactor: factor }));
    setAnswer('');
    setPhase('drill');
  }, [state, operation]);

  const handleAnswer = useCallback((fact: MathFact, correct: boolean, responseMs: number) => {
    void recordFactResult(uid, fact.id, correct, responseMs).then(setState);
  }, [uid]);

  const handleComplete = useCallback((result: QuizSummary) => {
    setSummary(result);
    setPhase('results');
    onComplete?.(result);
  }, [onComplete]);

  const meta = operationMeta(operation);

  if (phase === 'drill') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
        <QuizRunner<MathFact>
          questions={facts}
          keyOf={(fact) => fact.id}
          title={focusFactor === undefined ? `${meta.emoji} ${meta.label}` : `${meta.emoji} The ${focusFactor}s`}
          accent="violet"
          onExit={() => setPhase('overview')}
          onAnswer={(fact, outcome) => handleAnswer(fact, outcome.correct, outcome.responseMs)}
          onComplete={handleComplete}
          renderFeedback={({ question, outcome }) => {
            if (outcome.correct) {
              const fast = outcome.responseMs <= FLUENT_MS;
              return (
                <div className="rounded-2xl p-4 bg-green-50 text-green-800 text-center">
                  <p className="text-3xl mb-1" aria-hidden="true">{fast ? '⚡' : '🎉'}</p>
                  <p className="font-extrabold text-lg">{fast ? 'Instant!' : 'Correct!'}</p>
                  <p className="text-sm mt-1">
                    {fast
                      ? 'That one is locked in.'
                      : 'Right answer — a bit more practice and it will be automatic.'}
                  </p>
                </div>
              );
            }

            const diagnosis = diagnoseMathError({
              left: question.operation === 'sub' ? question.left + question.right : question.left,
              right: question.right,
              operation: question.operation,
              expected: question.answer,
              actual: Number(answer),
            });

            return (
              <div className="rounded-2xl p-4 bg-amber-50 text-amber-900">
                <p className="text-3xl text-center mb-1" aria-hidden="true">💡</p>
                <p className="font-extrabold text-lg text-center">
                  {question.prompt.replace('?', String(question.answer))}
                </p>
                <p className="text-sm mt-2 text-center">{diagnosis.message}</p>
                <p className="text-sm mt-1 text-center font-semibold">{diagnosis.nextStep}</p>
              </div>
            );
          }}
        >
          {({ question, submit, answered, index }) => (
            <FactCard
              key={`${index}-${question.id}`}
              fact={question}
              grade={grade}
              answered={answered}
              onSubmit={(entered) => {
                setAnswer(entered);
                const value = Number(entered);
                submit(Number.isFinite(value) && value === question.answer);
              }}
            />
          )}
        </QuizRunner>
      </div>
    );
  }

  if (phase === 'results' && summary) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-7 text-center shadow-lg">
          <ProgressRing percent={summary.accuracy} size={110} sublabel="correct" />
          <h2 className="text-2xl font-extrabold text-violet-700 mt-4">
            {summary.correct} of {summary.total} facts
          </h2>
          <p className="text-gray-500 mt-1">
            {summary.averageMs > 0 && `Average ${(summary.averageMs / 1000).toFixed(1)}s per fact`}
            {summary.bestStreak >= 3 && ` · best run ${summary.bestStreak}`}
          </p>
          <p className="text-sm text-violet-600 mt-3 font-semibold">
            {summaryForTable.fluent} of {summaryForTable.total} {meta.label.toLowerCase()} facts are instant.
          </p>
          <div className="flex flex-col gap-3 mt-6">
            <button
              type="button"
              onClick={() => start(focusFactor)}
              className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold active:bg-violet-700"
            >
              Practise again
            </button>
            <button
              type="button"
              onClick={() => setPhase('overview')}
              className="w-full py-3 rounded-2xl bg-violet-50 text-violet-700 font-bold"
            >
              See my grid
            </button>
            <button type="button" onClick={onExit} className="text-gray-400 font-medium py-2">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={onExit} className="text-violet-600 font-semibold text-sm md:text-base">
            ← Back
          </button>
          <h1 className="flex-1 text-center text-2xl md:text-3xl font-extrabold text-violet-700">
            ⚡ Fact Power
          </h1>
          <span className="w-12" />
        </div>

        <div className="flex gap-2 justify-center mb-6 flex-wrap">
          {operations.map((option) => {
            const optionMeta = operationMeta(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={option === operation}
                onClick={() => setOperation(option)}
                className={`px-4 py-2 rounded-2xl font-bold text-sm transition-colors ${
                  option === operation
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-violet-100 text-violet-600'
                }`}
              >
                {optionMeta.emoji} {optionMeta.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-3xl border border-violet-100 bg-white p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-5">
            <ProgressRing percent={summaryForTable.fluentPercent} size={84} sublabel="instant" />
            <div className="flex-1">
              <p className="font-extrabold text-violet-700 text-lg">
                {summaryForTable.fluent} of {summaryForTable.total} facts instant
              </p>
              <p className="text-sm text-gray-400">
                {summaryForTable.accurate} correct but slow · {summaryForTable.learning} still learning
              </p>
            </div>
          </div>

          <MasteryGrid grid={grid} operation={operation} onFocusFactor={(factor) => start(factor)} />

          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {MASTERY_LEGEND.map((entry) => (
              <span key={entry.level} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span aria-hidden="true" className={`w-3 h-3 rounded ${LEVEL_STYLE[entry.level].swatch}`} />
                {entry.label}
              </span>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-3">
            Tap a row or column number to drill just that table.
          </p>
        </div>

        {summaryForTable.weakest.length > 0 && (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 mt-4">
            <p className="font-bold text-amber-800 text-sm uppercase tracking-wide">Shakiest right now</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {summaryForTable.weakest.map((row) => (
                <span key={row.factId} className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-amber-700">
                  {row.factId.split(':')[1]?.replace('x', ` ${meta.symbol} `)}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => start(undefined)}
          className="w-full mt-5 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600
                     text-white text-lg font-bold active:opacity-90"
        >
          Start a {DRILL_SIZE}-fact drill
        </button>
      </div>
    </div>
  );
};

export default FactDrill;
