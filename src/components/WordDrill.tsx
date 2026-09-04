/**
 * WordDrill — say-it-aloud practice for a list of words.
 *
 * The Practice tab previously listed missed words as read-only cards; nothing
 * ever brought them back. This is the drill that closes that loop, and it is
 * shared by three callers:
 *
 *  - practice words carried over from reading sessions,
 *  - sight words on the Fry ladder,
 *  - any ad-hoc list a caller supplies.
 *
 * Assessment reuses the existing {@link PracticeButton} so scoring matches the
 * reading session exactly.
 */

import React, { useCallback, useState } from 'react';
import QuizRunner, { type QuizSummary } from './common/QuizRunner';
import PracticeButton from './PracticeButton';
import SpeakButton from './common/SpeakButton';
import SoundItOut from './SoundItOut';
import type { WordResult } from '../services/speechService';
import { readingLocale } from '../services/phonicsService';

/** Accuracy at or above which a spoken word counts as correct. */
export const WORD_DRILL_PASS_SCORE = 70;

export interface WordDrillProps {
  words: string[];
  title: string;
  accent?: 'violet' | 'indigo' | 'emerald' | 'amber';
  /** Called per word as it is answered. */
  onWordResult?: (word: string, correct: boolean) => void;
  onComplete: (summary: QuizSummary) => void;
  onExit?: () => void;
  /** Show a "sound it out" helper under each word. */
  showPhonics?: boolean;
}

const WordDrill: React.FC<WordDrillProps> = ({
  words,
  title,
  accent = 'emerald',
  onWordResult,
  onComplete,
  onExit,
  showPhonics = true,
}) => {
  const [lastScore, setLastScore] = useState<number | null>(null);

  const handleComplete = useCallback((summary: QuizSummary) => {
    setLastScore(null);
    onComplete(summary);
  }, [onComplete]);

  if (words.length === 0) {
    return (
      <div className="w-full max-w-xl mx-auto rounded-3xl border border-green-100 bg-green-50 p-6 text-center">
        <p className="text-5xl mb-2" aria-hidden="true">🎉</p>
        <p className="font-extrabold text-green-800 text-lg">Nothing to practise right now!</p>
        <p className="text-green-700 text-sm mt-1">Read a passage to find new words to work on.</p>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="w-full mt-5 py-3 rounded-2xl bg-green-600 text-white font-bold active:bg-green-700"
          >
            Back
          </button>
        )}
      </div>
    );
  }

  return (
    <QuizRunner<string>
      questions={words}
      keyOf={(word, index) => `${index}-${word}`}
      title={title}
      accent={accent}
      onExit={onExit}
      onAnswer={(word, outcome) => onWordResult?.(word, outcome.correct)}
      onComplete={handleComplete}
      renderFeedback={({ question, outcome }) => (
        <div className={`rounded-2xl p-4 text-center ${
          outcome.correct ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'
        }`}>
          <p className="text-3xl mb-1" aria-hidden="true">{outcome.correct ? '🎉' : '💪'}</p>
          <p className="font-extrabold text-lg">
            {outcome.correct ? 'Nailed it!' : `Keep working on "${question}"`}
          </p>
          {lastScore !== null && (
            <p className="text-sm mt-1">Pronunciation score: {lastScore}</p>
          )}
          {!outcome.correct && (
            <p className="text-sm mt-1">It will come round again soon.</p>
          )}
        </div>
      )}
    >
      {({ question, submit, answered, index }) => (
        <div key={`${index}-${question}`} className="rounded-3xl border border-gray-100 bg-white p-5 md:p-7 shadow-sm text-center">
          <div className="flex items-center justify-center gap-3">
            <p className="text-4xl md:text-6xl font-extrabold text-gray-800 tracking-wide">{question}</p>
            <SpeakButton text={question} locale={readingLocale(question)} label={`Hear ${question}`} />
          </div>

          {showPhonics && <div className="mt-4"><SoundItOut word={question} /></div>}

          {!answered && (
            <div className="mt-5">
              <PracticeButton
                word={question}
                locale={readingLocale(question)}
                onResult={(result: WordResult) => {
                  const score = Math.round(result.accuracyScore);
                  setLastScore(score);
                  submit(score >= WORD_DRILL_PASS_SCORE);
                }}
              />
              <button
                type="button"
                onClick={() => { setLastScore(null); submit(false); }}
                className="w-full mt-2 py-2 text-gray-400 font-medium text-sm"
              >
                Skip this word
              </button>
            </div>
          )}
        </div>
      )}
    </QuizRunner>
  );
};

export default WordDrill;
