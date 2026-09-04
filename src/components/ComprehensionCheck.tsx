/**
 * ComprehensionCheck — questions and an oral retell after a passage.
 *
 * The reading session measures whether the child *decoded* the words. This
 * measures whether they understood them, which is the whole point of reading
 * and is the single thing the app previously never asked about.
 *
 * Runs in two stages: multiple-choice questions, then an optional spoken
 * retell scored on how many key ideas the child covered in their own words.
 */

import React, { useCallback, useEffect, useState } from 'react';
import QuizRunner, { type QuizSummary } from './common/QuizRunner';
import ChoiceTiles from './common/ChoiceTiles';
import SpeakButton from './common/SpeakButton';
import ProgressRing from './common/ProgressRing';
import {
  QUESTION_KIND_META,
  generateComprehension,
  scoreRetell,
  type ComprehensionQuestion,
  type ComprehensionSet,
  type RetellScore,
} from '../services/comprehensionService';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';
import type { GradeCode } from '../types/grade';

export interface ComprehensionCheckProps {
  /** The passage the child just read. */
  text: string;
  grade: GradeCode;
  /** Called with the final percentage once the check is finished. */
  onComplete?: (result: { percent: number; correct: number; total: number; retell: RetellScore | null }) => void;
  onClose: () => void;
}

type Stage = 'loading' | 'questions' | 'retell' | 'done';

const ComprehensionCheck: React.FC<ComprehensionCheckProps> = ({ text, grade, onComplete, onClose }) => {
  const [set, setSet] = useState<ComprehensionSet | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [retell, setRetell] = useState<RetellScore | null>(null);
  const [recording, setRecording] = useState(false);
  const [retellError, setRetellError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStage('loading');
    generateComprehension(text, grade)
      .then((result) => {
        if (cancelled) return;
        setSet(result);
        setStage(result.questions.length > 0 ? 'questions' : 'retell');
      })
      .catch(() => { if (!cancelled) setStage('retell'); });
    return () => { cancelled = true; };
  }, [text, grade]);

  const handleComplete = useCallback((result: QuizSummary) => {
    setSummary(result);
    setStage('retell');
  }, []);

  const finish = useCallback((finalRetell: RetellScore | null) => {
    setStage('done');
    onComplete?.({
      percent: summary?.accuracy ?? 0,
      correct: summary?.correct ?? 0,
      total: summary?.total ?? 0,
      retell: finalRetell,
    });
  }, [onComplete, summary]);

  const recordRetell = useCallback(async () => {
    if (recording || !set) return;
    setRecording(true);
    setRetellError('');
    try {
      const recorder = await recordAudioClip();
      const blob = await recorder.stopped;
      const { text: spoken } = await transcribeAudio(blob);
      setRetell(scoreRetell(spoken, set.keyIdeas));
    } catch {
      setRetellError('Could not hear that — check the microphone and try again.');
    } finally {
      setRecording(false);
    }
  }, [recording, set]);

  if (stage === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-indigo-600 font-medium">Thinking up some questions…</p>
      </div>
    );
  }

  if (stage === 'questions' && set) {
    return (
      <QuizRunner<ComprehensionQuestion>
        questions={set.questions}
        keyOf={(question) => question.id}
        title="Did you get it?"
        accent="indigo"
        onExit={onClose}
        onComplete={handleComplete}
        renderFeedback={({ question, outcome }) => (
          <div className={`rounded-2xl p-4 ${outcome.correct ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
            <p className="font-extrabold text-lg">{outcome.correct ? '🎉 Yes!' : '💡 Not quite'}</p>
            <p className="text-sm mt-1">{question.explanation}</p>
          </div>
        )}
      >
        {({ question, submit, answered }) => {
          const meta = QUESTION_KIND_META[question.kind];
          return (
            <div className="rounded-3xl border border-indigo-100 bg-white p-5 md:p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-400">
                {meta.emoji} {meta.label}
              </p>
              <div className="flex items-start gap-3 mt-2 mb-5">
                <p className="flex-1 text-xl md:text-2xl font-bold text-gray-800">{question.prompt}</p>
                <SpeakButton text={question.prompt} label="Read the question aloud" />
              </div>
              <ChoiceTiles
                choices={question.choices}
                selectedIndex={selected}
                correctIndex={answered ? question.answerIndex : undefined}
                revealed={answered}
                label={question.prompt}
                onSelect={(index) => {
                  setSelected(index);
                  submit(index === question.answerIndex);
                }}
              />
            </div>
          );
        }}
      </QuizRunner>
    );
  }

  if (stage === 'retell' && set) {
    return (
      <div className="w-full max-w-xl mx-auto rounded-3xl border border-indigo-100 bg-white p-5 md:p-7 shadow-sm">
        {summary && (
          <div className="flex items-center gap-4 mb-5">
            <ProgressRing
              percent={summary.accuracy}
              size={72}
              label={`${summary.correct}/${summary.total}`}
              colorClass="text-indigo-500"
              trackClass="text-indigo-100"
            />
            <div>
              <p className="font-extrabold text-indigo-700 text-lg">
                {summary.accuracy >= 80 ? 'Great understanding!' : summary.accuracy >= 50 ? 'Good thinking!' : 'Keep practising!'}
              </p>
              <p className="text-sm text-gray-400">Questions answered</p>
            </div>
          </div>
        )}

        <h3 className="font-extrabold text-indigo-700 text-lg">Now tell it back 🎤</h3>
        <p className="text-gray-500 text-sm md:text-base mt-1 mb-4">
          Say what happened in your own words. You do not have to use the same sentences.
        </p>

        <button
          type="button"
          onClick={recordRetell}
          disabled={recording}
          className="w-full py-4 rounded-2xl bg-green-500 text-white font-bold text-lg
                     active:bg-green-600 disabled:bg-green-300 transition-colors"
        >
          {recording ? '🎤 Listening…' : retell ? '🎤 Try the retell again' : '🎤 Start retelling'}
        </button>

        {retellError && <p className="text-red-600 text-sm mt-3 text-center">{retellError}</p>}

        {retell && (
          <div className="mt-4 rounded-2xl bg-indigo-50 p-4">
            <p className="font-extrabold text-indigo-800">{retell.label}</p>
            <p className="text-sm text-indigo-700 mt-1">{retell.message}</p>
            <p className="text-sm text-indigo-600 mt-2 font-semibold">
              You covered {retell.covered.length} of {retell.covered.length + retell.missed.length} main ideas.
            </p>
            {retell.missed.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-400">Still to mention</p>
                <ul className="mt-1 space-y-1">
                  {retell.missed.map((idea) => (
                    <li key={idea} className="text-sm text-indigo-700">• {idea}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => finish(retell)}
          className="w-full mt-4 py-3 rounded-2xl bg-indigo-600 text-white font-bold active:bg-indigo-700"
        >
          {retell ? 'Finish' : 'Skip the retell'}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto rounded-3xl border border-green-100 bg-green-50 p-6 text-center">
      <p className="text-5xl mb-2" aria-hidden="true">✅</p>
      <p className="font-extrabold text-green-800 text-lg">Comprehension check complete!</p>
      <button
        type="button"
        onClick={onClose}
        className="w-full mt-5 py-3 rounded-2xl bg-green-600 text-white font-bold active:bg-green-700"
      >
        Back to reading
      </button>
    </div>
  );
};

export default ComprehensionCheck;
