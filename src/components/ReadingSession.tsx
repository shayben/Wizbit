import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import WordCard from './WordCard';
import type { WordStatus } from './WordCard';
import { startPronunciationAssessment, speakWord } from '../services/speechService';
import type { WordResult, AssessmentResult } from '../services/speechService';
import { calculateGamificationScore } from '../services/gamificationService';

interface ReadingSessionProps {
  text: string;
  onReset: () => void;
}

/** Tokenise text into words, stripping punctuation for matching but keeping display form. */
function tokenise(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

/** Strip punctuation and lowercase a word for comparison. */
function normalise(word: string): string {
  return word.replace(/[^a-zA-Z0-9']/g, '').toLowerCase();
}

const ReadingSession: React.FC<ReadingSessionProps> = ({ text, onReset }) => {
  const words = tokenise(text);

  const [statuses, setStatuses] = useState<Record<number, WordStatus>>({});
  const [scores, setScores] = useState<Record<number, number>>({});
  const [listening, setListening] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fluencyScore, setFluencyScore] = useState<number | undefined>(undefined);

  const stopRef = useRef<(() => void) | null>(null);

  // Build a lookup: normalised word → array of indices (handles repeated words)
  const wordIndexMap = useRef<Record<string, number[]>>({});
  useEffect(() => {
    const map: Record<string, number[]> = {};
    tokenise(text).forEach((w, i) => {
      const key = normalise(w);
      if (!map[key]) map[key] = [];
      map[key].push(i);
    });
    wordIndexMap.current = map;
  }, [text]);

  // Track which occurrence of each word we've matched so far
  const matchPointer = useRef<Record<string, number>>({});

  const handleWordResult = useCallback((result: WordResult) => {
    const key = normalise(result.word);
    const indices = wordIndexMap.current[key];
    if (!indices) return;

    const pointer = matchPointer.current[key] ?? 0;
    const idx = indices[pointer];
    if (idx === undefined) return;

    matchPointer.current[key] = pointer + 1;

    const status: WordStatus =
      result.errorType === 'None' || result.accuracyScore >= 70 ? 'correct' : 'mispronounced';

    setStatuses((prev) => ({ ...prev, [idx]: status }));
    setScores((prev) => ({ ...prev, [idx]: result.accuracyScore }));
  }, []);

  const handleDone = useCallback((result: AssessmentResult) => {
    setFluencyScore(result.fluencyScore > 0 ? result.fluencyScore : undefined);
    setListening(false);
    setSessionDone(true);
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    setSessionDone(false);
    setStatuses({});
    setScores({});
    setFluencyScore(undefined);
    matchPointer.current = {};

    try {
      const stop = startPronunciationAssessment(
        text,
        handleWordResult,
        handleDone,
        handleError,
      );
      stopRef.current = stop;
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [text, handleWordResult, handleDone, handleError]);

  const stopListening = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopRef.current?.();
    };
  }, []);

  const handleWordClick = useCallback((word: string) => {
    speakWord(word);
  }, []);

  // Derived gamification score — recalculated whenever word results or fluency change.
  const gamificationScore = useMemo(
    () => calculateGamificationScore(words, statuses, scores, fluencyScore),
    [words, statuses, scores, fluencyScore],
  );

  // Live progress: percentage of words assessed so far (for the progress bar while listening).
  const assessedCount = Object.keys(statuses).length;
  const correctCount = Object.values(statuses).filter((s) => s === 'correct').length;

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto p-4">
      <h2 className="text-2xl font-bold text-indigo-700 text-center">📚 Reading Session</h2>

      <p className="text-gray-500 text-xs text-center">
        Tap a word any time to hear how it's pronounced.
        Green = correct · Red = needs practice · Yellow = skipped
      </p>

      {/* Word grid */}
      <div className="flex flex-wrap justify-start bg-gray-50 rounded-2xl p-3 shadow-inner min-h-32">
        {words.map((word, i) => (
          <WordCard
            key={i}
            word={word}
            status={statuses[i] ?? 'pending'}
            score={scores[i]}
            onClick={handleWordClick}
          />
        ))}
      </div>

      {/* Live progress bar (visible while words are being assessed) */}
      {assessedCount > 0 && !sessionDone && (
        <div className="w-full">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${Math.round((assessedCount / words.length) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-right mt-0.5">
            {assessedCount} / {words.length} words
          </p>
        </div>
      )}

      {/* Gamification score card — shown after session ends */}
      {sessionDone && gamificationScore && !error && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-4 shadow-sm">
          {/* Score number + stars */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <span className="text-5xl font-extrabold text-indigo-700 leading-none">
                {gamificationScore.score}
              </span>
              <span className="text-lg text-indigo-400 ml-1">/ 100</span>
            </div>
            <div className="text-right">
              <p className="text-2xl leading-none mb-1">
                {'⭐'.repeat(gamificationScore.stars)}{'☆'.repeat(5 - gamificationScore.stars)}
              </p>
              <p className="text-sm font-semibold text-indigo-600">{gamificationScore.label}</p>
            </div>
          </div>

          {/* Score bar */}
          <div className="w-full bg-indigo-100 rounded-full h-3 mb-3">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${
                gamificationScore.score >= 75
                  ? 'bg-green-500'
                  : gamificationScore.score >= 50
                    ? 'bg-indigo-500'
                    : 'bg-yellow-400'
              }`}
              style={{ width: `${gamificationScore.score}%` }}
            />
          </div>

          {/* Encouraging message */}
          <p className="text-indigo-700 font-medium text-sm text-center">
            {gamificationScore.message}
          </p>

          {/* Word stats */}
          <p className="text-gray-500 text-xs text-center mt-2">
            {correctCount} word{correctCount !== 1 ? 's' : ''} correct out of {assessedCount} assessed
            {gamificationScore.hardWordCount > 0 && (
              <> · {gamificationScore.hardWordCount} difficult word{gamificationScore.hardWordCount !== 1 ? 's' : ''} attempted</>
            )}
          </p>
        </div>
      )}

      {/* Partial live score (while listening, show simple percentage) */}
      {!sessionDone && gamificationScore && (
        <p className="text-center text-sm text-gray-500">
          Score so far: <strong className="text-indigo-700">{gamificationScore.score}</strong> / 100
        </p>
      )}

      {error && (
        <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!listening ? (
          <button
            type="button"
            onClick={startListening}
            className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold text-lg
                       active:bg-green-600 transition-colors shadow"
          >
            🎤 {sessionDone ? 'Try Again' : 'Start Reading'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopListening}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-lg
                       active:bg-red-600 transition-colors shadow animate-pulse"
          >
            ⏹ Stop Recording
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold text-lg
                     active:bg-gray-300 transition-colors"
        >
          🔄 New Assignment
        </button>
      </div>

      <div className="text-center">
        <p className="text-gray-400 text-xs">Tap any word to hear its correct pronunciation</p>
      </div>
    </div>
  );
};

export default ReadingSession;
