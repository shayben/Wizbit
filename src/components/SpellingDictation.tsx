/**
 * SpellingDictation — hear a word, then spell it.
 *
 * `SoundItOut` takes children from letters to sounds; this is the production
 * half they previously had no way to practise. Dictation is how spelling is
 * assessed in class and the quickest way to find out whether a phonics pattern
 * has actually stuck.
 *
 * The word is never shown before the child answers — that is what makes it a
 * spelling test rather than a copying exercise.
 */

import React, { useCallback, useState } from 'react';
import QuizRunner, { type QuizSummary } from './common/QuizRunner';
import SpeakButton from './common/SpeakButton';
import { checkSpelling, patternForWord, type SpellingCheck } from '../services/spellingService';

export interface SpellingDictationProps {
  words: string[];
  title?: string;
  onWordResult?: (word: string, correct: boolean) => void;
  onComplete: (summary: QuizSummary) => void;
  onExit?: () => void;
}

interface SpellingCardProps {
  word: string;
  answered: boolean;
  onSubmit: (result: SpellingCheck) => void;
}

/**
 * One dictated word. Mounted with the word as its key so the typed attempt
 * resets automatically on every new word.
 */
const SpellingCard: React.FC<SpellingCardProps> = ({ word, answered, onSubmit }) => {
  const [attempt, setAttempt] = useState('');
  const pattern = patternForWord(word);

  return (
    <div className="rounded-3xl border border-amber-100 bg-white p-5 md:p-7 shadow-sm">
      {pattern && (
        <p className="text-xs font-bold uppercase tracking-wide text-amber-500 text-center">
          {pattern.emoji} {pattern.name}
        </p>
      )}

      <p className="text-center text-gray-500 mt-2 mb-4">Listen, then write the word.</p>

      {/* autoSpeak keys off the word, so each new word is read aloud once. */}
      <SpeakButton text={word} variant="full" label="Hear the word again" autoSpeak />

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (answered) return;
          onSubmit(checkSpelling(word, attempt));
        }}
      >
        <label htmlFor="spelling-input" className="sr-only">Spell the word you heard</label>
        <input
          id="spelling-input"
          value={attempt}
          onChange={(event) => setAttempt(event.target.value)}
          disabled={answered}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Type it here"
          className="w-full rounded-2xl border-2 border-amber-200 px-4 py-4 text-center
                     text-2xl md:text-3xl font-bold tracking-wide outline-none
                     focus:border-amber-500 disabled:bg-gray-50"
        />
        {!answered && (
          <button
            type="submit"
            disabled={attempt.trim().length === 0}
            className="w-full mt-3 py-4 rounded-2xl bg-amber-500 text-white text-lg font-bold
                       active:bg-amber-600 disabled:bg-amber-200 transition-colors"
          >
            Check spelling
          </button>
        )}
      </form>

      {!answered && (
        <button
          type="button"
          onClick={() => onSubmit(checkSpelling(word, ''))}
          className="w-full mt-2 py-2 text-gray-400 font-medium text-sm"
        >
          I don't know this one
        </button>
      )}
    </div>
  );
};

const SpellingDictation: React.FC<SpellingDictationProps> = ({
  words,
  title = 'Spelling',
  onWordResult,
  onComplete,
  onExit,
}) => {
  const [check, setCheck] = useState<SpellingCheck | null>(null);

  const handleComplete = useCallback((summary: QuizSummary) => {
    setCheck(null);
    onComplete(summary);
  }, [onComplete]);

  if (words.length === 0) {
    return (
      <div className="w-full max-w-xl mx-auto rounded-3xl border border-amber-100 bg-amber-50 p-6 text-center">
        <p className="font-extrabold text-amber-800 text-lg">No spelling words right now.</p>
        {onExit && (
          <button type="button" onClick={onExit} className="w-full mt-5 py-3 rounded-2xl bg-amber-600 text-white font-bold">
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
      accent="amber"
      onExit={onExit}
      onAnswer={(word, outcome) => onWordResult?.(word, outcome.correct)}
      onComplete={handleComplete}
      renderFeedback={({ question, outcome }) => (
        <div className={`rounded-2xl p-4 ${outcome.correct ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
          <p className="text-3xl text-center mb-1" aria-hidden="true">{outcome.correct ? '🎉' : '💡'}</p>
          <p className="font-extrabold text-lg text-center">
            {outcome.correct ? 'Spelled it!' : 'Not quite'}
          </p>
          {!outcome.correct && (
            <>
              <p className="text-center mt-2">
                You wrote <span className="font-bold">{check?.normalized || '(nothing)'}</span>
              </p>
              <p className="text-center text-xl font-extrabold tracking-widest mt-1">{question}</p>
            </>
          )}
          {check && <p className="text-sm mt-3 text-center">{check.hint}</p>}
        </div>
      )}
    >
      {({ question, submit, answered, index }) => (
        <SpellingCard
          key={`${index}-${question}`}
          word={question}
          answered={answered}
          onSubmit={(result) => {
            setCheck(result);
            submit(result.correct);
          }}
        />
      )}
    </QuizRunner>
  );
};

export default SpellingDictation;
