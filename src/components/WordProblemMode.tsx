/**
 * WordProblemMode — math stated in words.
 *
 * Bare computation was the app's only math. Both grade 1 and grade 3 standards
 * are dominated by problems stated in words, and turning a sentence into an
 * equation is the part that transfers. A read-aloud button is essential rather
 * than decorative here: a six-year-old can often solve a problem they cannot
 * yet decode.
 */

import React, { useCallback, useEffect, useState } from 'react';
import QuizRunner, { type QuizSummary } from './common/QuizRunner';
import NumberPad from './common/NumberPad';
import SpeakButton from './common/SpeakButton';
import ProgressRing from './common/ProgressRing';
import {
  STRUCTURE_META,
  generateWordProblems,
  type WordProblem,
} from '../services/wordProblemService';
import { diagnoseMathError } from '../services/mathErrorService';
import type { GradeCode } from '../types/grade';

export interface WordProblemModeProps {
  grade: GradeCode;
  /** Learner's name, so problems can be about them. */
  learnerName?: string;
  count?: number;
  onComplete?: (summary: QuizSummary) => void;
  onExit: () => void;
}

interface ProblemCardProps {
  problem: WordProblem;
  answered: boolean;
  onSubmit: (entered: string) => void;
}

/** One problem and its pad, keyed so the pad resets on every question. */
const ProblemCard: React.FC<ProblemCardProps> = ({ problem, answered, onSubmit }) => {
  const [entered, setEntered] = useState('');
  const meta = STRUCTURE_META[problem.structure];

  return (
    <div className="rounded-3xl border border-violet-100 bg-white p-5 md:p-7 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-400">
        {meta.emoji} {meta.label}
      </p>

      <p className="text-xl md:text-2xl font-semibold text-gray-800 leading-relaxed mt-3">
        {problem.text}
      </p>

      <SpeakButton
        text={problem.text}
        variant="full"
        label="Read the problem aloud"
        className="mt-4"
      />

      {!answered && (
        <div className="mt-5">
          <NumberPad
            value={entered}
            onChange={setEntered}
            onSubmit={() => onSubmit(entered)}
            maxLength={5}
          />
          {problem.unit && (
            <p className="text-center text-sm text-gray-400 mt-2">Answer in {problem.unit}</p>
          )}
        </div>
      )}
    </div>
  );
};

const WordProblemMode: React.FC<WordProblemModeProps> = ({
  grade,
  learnerName,
  count = 5,
  onComplete,
  onExit,
}) => {
  // Results are tagged with the request that produced them, so a change of
  // grade or learner shows the loading state again without an effect having to
  // reset state synchronously.
  const requestKey = `${grade}|${count}|${learnerName ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; problems: WordProblem[] } | null>(null);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [lastEntered, setLastEntered] = useState('');

  const problems = loaded && loaded.key === requestKey ? loaded.problems : null;

  useEffect(() => {
    let cancelled = false;
    generateWordProblems({ grade, count, learnerName, seed: Date.now() % 100_000 })
      .then((result) => { if (!cancelled) setLoaded({ key: requestKey, problems: result.problems }); })
      .catch(() => { if (!cancelled) setLoaded({ key: requestKey, problems: [] }); });
    return () => { cancelled = true; };
  }, [requestKey, grade, count, learnerName]);

  const handleComplete = useCallback((result: QuizSummary) => {
    setSummary(result);
    onComplete?.(result);
  }, [onComplete]);

  if (problems === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-violet-600 font-medium">Writing some problems…</p>
      </div>
    );
  }

  if (summary) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-7 text-center shadow-lg">
          <ProgressRing percent={summary.accuracy} size={110} sublabel="correct" />
          <h2 className="text-2xl font-extrabold text-violet-700 mt-4">
            {summary.correct} of {summary.total} solved
          </h2>
          <p className="text-gray-500 mt-1">
            {summary.accuracy >= 80
              ? 'You are turning sentences into equations brilliantly.'
              : 'Word problems are tricky — reading them twice really helps.'}
          </p>
          <button
            type="button"
            onClick={onExit}
            className="w-full mt-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:bg-violet-700"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  if (problems.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-7 text-center">
          <p className="font-extrabold text-violet-700 text-lg">No problems available right now.</p>
          <button
            type="button"
            onClick={onExit}
            className="w-full mt-5 py-3 rounded-2xl bg-violet-600 text-white font-bold"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
      <QuizRunner<WordProblem>
        questions={problems}
        keyOf={(problem) => problem.id}
        title="🧠 Word Problems"
        accent="violet"
        onExit={onExit}
        onComplete={handleComplete}
        renderFeedback={({ question, outcome }) => (
          <div className={`rounded-2xl p-4 ${outcome.correct ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
            <p className="text-3xl text-center mb-1" aria-hidden="true">{outcome.correct ? '🎉' : '💡'}</p>
            <p className="font-extrabold text-lg text-center">
              {outcome.correct ? 'Solved it!' : `The answer is ${question.answer}`}
            </p>
            {question.equation && (
              <p className="text-center text-lg font-bold mt-2">{question.equation}</p>
            )}
            <p className="text-sm mt-2 text-center">
              {outcome.correct
                ? question.strategy
                : diagnoseMathError({ expected: question.answer, actual: Number(lastEntered) }).nextStep}
            </p>
            {!outcome.correct && (
              <p className="text-sm mt-1 text-center font-semibold">{question.strategy}</p>
            )}
          </div>
        )}
      >
        {({ question, submit, answered, index }) => (
          <ProblemCard
            key={`${index}-${question.id}`}
            problem={question}
            answered={answered}
            onSubmit={(entered) => {
              setLastEntered(entered);
              const value = Number(entered);
              submit(Number.isFinite(value) && value === question.answer);
            }}
          />
        )}
      </QuizRunner>
    </div>
  );
};

export default WordProblemMode;
