/**
 * QuizRunner — the shared ask → answer → feedback → next loop.
 *
 * Comprehension, sight words, spelling, math facts and word problems are all
 * the same interaction with a different question body, so the sequencing,
 * progress bar, streak tracking, timing and results handoff live here once.
 * Callers supply their own question type and render its body; the runner owns
 * everything around it.
 *
 * Response time is measured from when the question is *shown*, which is what
 * fact-fluency scoring needs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { summarizeOutcomes, type QuizOutcome, type QuizSummary } from '../../services/quizSummary';

export type { QuizOutcome, QuizSummary } from '../../services/quizSummary';

export interface QuizRunnerRenderArgs<Q> {
  question: Q;
  index: number;
  total: number;
  /** Call when the child submits. Safe to call once per question. */
  submit: (correct: boolean) => void;
  /** True once this question has been answered. */
  answered: boolean;
  /** The outcome of this question, once answered. */
  outcome: QuizOutcome | null;
}

export interface QuizRunnerProps<Q> {
  questions: Q[];
  /** Stable key for a question — used for React keys and timing resets. */
  keyOf: (question: Q, index: number) => string;
  /** Renders the question body and its answer surface. */
  children: (args: QuizRunnerRenderArgs<Q>) => React.ReactNode;
  /** Renders feedback after an answer. The runner supplies the Next button. */
  renderFeedback?: (args: { question: Q; outcome: QuizOutcome }) => React.ReactNode;
  /** Called once per answered question, as it happens. */
  onAnswer?: (question: Q, outcome: QuizOutcome) => void;
  /** Called once when the last question is finished. */
  onComplete: (summary: QuizSummary) => void;
  /** Title shown above the progress bar. */
  title?: string;
  accent?: 'violet' | 'indigo' | 'emerald' | 'amber';
  onExit?: () => void;
}

const ACCENTS = {
  violet: { bar: 'bg-violet-500', track: 'bg-violet-100', text: 'text-violet-600', button: 'bg-violet-600 active:bg-violet-700' },
  indigo: { bar: 'bg-indigo-500', track: 'bg-indigo-100', text: 'text-indigo-600', button: 'bg-indigo-600 active:bg-indigo-700' },
  emerald: { bar: 'bg-emerald-500', track: 'bg-emerald-100', text: 'text-emerald-600', button: 'bg-emerald-600 active:bg-emerald-700' },
  amber: { bar: 'bg-amber-500', track: 'bg-amber-100', text: 'text-amber-600', button: 'bg-amber-600 active:bg-amber-700' },
} as const;

/**
 * Renders the caller's question body.
 *
 * Extracted so the runner passes `submit` down as a prop instead of invoking a
 * ref-reading callback during its own render.
 */
function QuestionSlot<Q>({
  render,
  args,
}: {
  render: (args: QuizRunnerRenderArgs<Q>) => React.ReactNode;
  args: QuizRunnerRenderArgs<Q>;
}) {
  return <>{render(args)}</>;
}

function QuizRunner<Q>({
  questions,
  keyOf,
  children,
  renderFeedback,
  onAnswer,
  onComplete,
  title,
  accent = 'violet',
  onExit,
}: QuizRunnerProps<Q>) {
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<QuizOutcome[]>([]);
  // The answer is tagged with the question it belongs to, so advancing the
  // index clears the feedback without an effect resetting state.
  const [answer, setAnswer] = useState<{ index: number; outcome: QuizOutcome } | null>(null);
  // Set when a question is shown (see the effect below); 0 until then.
  const shownAt = useRef<number>(0);
  const completedRef = useRef(false);

  const question = questions[index];
  const tone = ACCENTS[accent];

  const current = answer !== null && answer.index === index ? answer.outcome : null;

  // Restart the clock whenever a new question is shown.
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, questions]);

  const submit = useCallback((correct: boolean) => {
    if (current !== null || !question) return;
    const outcome: QuizOutcome = { correct, responseMs: Math.max(0, Date.now() - shownAt.current) };
    setAnswer({ index, outcome });
    setOutcomes((previous) => [...previous, outcome]);
    onAnswer?.(question, outcome);
  }, [current, index, onAnswer, question]);

  const next = useCallback(() => {
    if (current === null) return;
    if (index + 1 < questions.length) {
      setIndex((value) => value + 1);
      return;
    }
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(summarizeOutcomes([...outcomes]));
  }, [current, index, onComplete, outcomes, questions.length]);

  const streak = useMemo(() => {
    let run = 0;
    for (let i = outcomes.length - 1; i >= 0; i -= 1) {
      if (!outcomes[i].correct) break;
      run += 1;
    }
    return run;
  }, [outcomes]);

  if (!question) return null;

  const progress = questions.length === 0 ? 0 : ((index + (current ? 1 : 0)) / questions.length) * 100;

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        {onExit ? (
          <button type="button" onClick={onExit} className={`${tone.text} font-semibold text-sm md:text-base`}>
            ← Back
          </button>
        ) : <span />}
        <span className={`text-sm font-semibold ${tone.text}`}>{title}</span>
        <span className="text-sm font-semibold text-gray-400">
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className={`h-2 rounded-full ${tone.track} overflow-hidden mb-2`}>
        <div className={`h-full ${tone.bar} transition-all duration-300`} style={{ width: `${progress}%` }} />
      </div>

      <p className="h-6 text-center text-sm font-bold text-amber-500" aria-live="polite">
        {streak >= 3 ? `🔥 ${streak} in a row!` : ''}
      </p>

      <QuestionSlot
        key={keyOf(question, index)}
        render={children}
        args={{ question, index, total: questions.length, submit, answered: current !== null, outcome: current }}
      />

      {current !== null && (
        <div className="mt-4" role="status" aria-live="polite">
          {renderFeedback?.({ question, outcome: current })}
          <button
            type="button"
            autoFocus
            onClick={next}
            className={`w-full mt-3 py-4 rounded-2xl text-white text-lg font-bold transition-colors ${tone.button}`}
          >
            {index + 1 < questions.length ? 'Next' : 'See results'}
          </button>
        </div>
      )}
    </div>
  );
}

export default QuizRunner;
