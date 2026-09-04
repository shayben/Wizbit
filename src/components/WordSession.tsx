/**
 * WordSession — the container that turns a word list into a scheduled drill.
 *
 * Handles the shared lifecycle for the three word-based activities: load the
 * learner's spaced-repetition state, build a session, run the drill, record
 * each outcome, and report the result to the daily plan and buddy XP.
 *
 * The three modes differ only in where their candidate words come from, which
 * is why they share one container rather than three near-identical ones.
 */

import React, { useCallback, useEffect, useState } from 'react';
import WordDrill from './WordDrill';
import SpellingDictation from './SpellingDictation';
import BuddyAwardToast from './BuddyAwardToast';
import { useActivityRecorder } from '../hooks/useActivityRecorder';
import {
  buildSightWordSession,
  loadSightWordProgress,
  recordSightWord,
} from '../services/sightWordService';
import {
  buildSpellingSession,
  loadSpellingProgress,
  recordSpellingWord,
} from '../services/spellingService';
import { loadPracticeWords, updatePracticeWords } from '../services/progressService';
import type { BuddyAward } from '../services/buddyService';
import type { QuizSummary } from '../services/quizSummary';
import type { GradeCode } from '../types/grade';

export type WordSessionMode = 'sight-words' | 'spelling' | 'practice-words';

export interface WordSessionProps {
  mode: WordSessionMode;
  uid: string | null;
  grade: GradeCode;
  size?: number;
  onExit: () => void;
}

const MODE_META: Record<WordSessionMode, { title: string; activity: 'sight-words' | 'spelling' | 'practice-words' }> = {
  'sight-words': { title: '⚡ Sight Words', activity: 'sight-words' },
  spelling: { title: '✏️ Spelling', activity: 'spelling' },
  'practice-words': { title: '💪 Tricky Words', activity: 'practice-words' },
};

const WordSession: React.FC<WordSessionProps> = ({ mode, uid, grade, size = 10, onExit }) => {
  const [words, setWords] = useState<string[] | null>(null);
  const [award, setAward] = useState<BuddyAward | null>(null);
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const recorder = useActivityRecorder(uid, MODE_META[mode].activity);

  useEffect(() => {
    let cancelled = false;

    async function loadWords(): Promise<string[]> {
      if (mode === 'sight-words') {
        return buildSightWordSession(await loadSightWordProgress(uid), grade, size);
      }
      if (mode === 'spelling') {
        return buildSpellingSession(await loadSpellingProgress(uid), grade, size);
      }
      // Practice words come from actual reading misses, hardest first.
      if (!uid) return [];
      const practice = await loadPracticeWords(uid);
      return practice
        .sort((a, b) => b.failCount - a.failCount)
        .slice(0, size)
        .map((entry) => entry.word);
    }

    loadWords()
      .then((list) => { if (!cancelled) setWords(list); })
      .catch(() => { if (!cancelled) setWords([]); });

    return () => { cancelled = true; };
  }, [mode, uid, grade, size]);

  const handleWordResult = useCallback((word: string, correct: boolean) => {
    if (mode === 'sight-words') {
      void recordSightWord(uid, word, correct);
    } else if (mode === 'spelling') {
      void recordSpellingWord(uid, word, correct);
    } else if (uid) {
      // A correctly read practice word clears; a missed one counts again.
      void updatePracticeWords(uid, correct ? [] : [word], correct ? [word] : []);
    }
  }, [mode, uid]);

  const handleComplete = useCallback(async (result: QuizSummary) => {
    setSummary(result);
    setAward(await recorder.complete(result));
  }, [recorder]);

  if (words === null) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-indigo-600 font-medium">Getting your words ready…</p>
      </div>
    );
  }

  if (summary) {
    return (
      <>
        <BuddyAwardToast award={award} onDismiss={() => setAward(null)} />
        <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center p-5">
          <div className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white p-7 text-center shadow-lg">
            <p className="text-6xl mb-2" aria-hidden="true">
              {summary.accuracy >= 80 ? '🌟' : summary.accuracy >= 50 ? '🎯' : '💪'}
            </p>
            <h2 className="text-2xl font-extrabold text-indigo-700">
              {summary.correct} of {summary.total} words
            </h2>
            <p className="text-gray-500 mt-2">
              {summary.accuracy >= 80
                ? 'These are becoming automatic!'
                : 'The ones you missed will come back soon.'}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="w-full mt-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold active:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-5 md:p-10">
      {mode === 'spelling' ? (
        <SpellingDictation
          words={words}
          title={MODE_META[mode].title}
          onWordResult={handleWordResult}
          onComplete={handleComplete}
          onExit={onExit}
        />
      ) : (
        <WordDrill
          words={words}
          title={MODE_META[mode].title}
          accent={mode === 'sight-words' ? 'emerald' : 'indigo'}
          showPhonics={mode === 'practice-words'}
          onWordResult={handleWordResult}
          onComplete={handleComplete}
          onExit={onExit}
        />
      )}
    </div>
  );
};

export default WordSession;
