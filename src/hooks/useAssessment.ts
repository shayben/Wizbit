/**
 * Hook: manages pronunciation assessment via the Speech SDK.
 * Tracks per-word statuses, scores, timings, and the assessment lifecycle.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { WordStatus } from '../types/word';
import { startWindowedPronunciationAssessment } from '../services/speechService';
import type { WordResult, AssessmentResult } from '../services/speechService';

export interface WordTiming {
  offsetSec: number;
  durationSec: number;
  phonemeScores: number[];
}

interface UseAssessmentOptions {
  words: string[];
  /** Sentence-aligned word groups — each group becomes one recognition window. */
  wordGroups: string[][];
  onSessionDone?: () => void;
}

export function useAssessment({ words, wordGroups, onSessionDone }: UseAssessmentOptions) {
  const [statuses, setStatuses] = useState<Record<number, WordStatus>>({});
  const [scores, setScores] = useState<Record<number, number>>({});
  const [wordTimings, setWordTimings] = useState<Record<number, WordTiming>>({});
  const [listening, setListening] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fluencyScore, setFluencyScore] = useState<number | undefined>(undefined);
  const [nextWordIndex, setNextWordIndex] = useState(0);

  const nextWordRef = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);

  const handleWordResult = useCallback((result: WordResult) => {
    const idx = nextWordRef.current;
    if (idx >= words.length) return;

    const status: WordStatus =
      result.errorType === 'Omission'
        ? 'skipped'
        : result.errorType === 'None' || result.accuracyScore >= 70
          ? 'correct'
          : 'mispronounced';

    setStatuses((prev) => ({ ...prev, [idx]: status }));
    setScores((prev) => ({ ...prev, [idx]: result.accuracyScore }));
    setWordTimings((prev) => ({
      ...prev,
      [idx]: {
        offsetSec: result.offsetSec,
        durationSec: result.durationSec,
        phonemeScores: result.phonemeScores,
      },
    }));

    nextWordRef.current = idx + 1;
    setNextWordIndex(idx + 1);
  }, [words.length]);

  const handleDone = useCallback((result: AssessmentResult) => {
    setFluencyScore(result.fluencyScore > 0 ? result.fluencyScore : undefined);
    setListening(false);
    setSessionDone(true);
    onSessionDone?.();
  }, [onSessionDone]);

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
    setWordTimings({});
    nextWordRef.current = 0;
    setNextWordIndex(0);

    try {
      const stop = startWindowedPronunciationAssessment(
        wordGroups,
        handleWordResult,
        handleDone,
        handleError,
      );
      stopRef.current = stop;
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [wordGroups, handleWordResult, handleDone, handleError]);

  const stopListening = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }, []);

  const updateWordResult = useCallback((index: number, result: WordResult) => {
    const status: WordStatus =
      result.errorType === 'None' || result.accuracyScore >= 70 ? 'correct' : 'mispronounced';
    setStatuses((prev) => ({ ...prev, [index]: status }));
    setScores((prev) => ({ ...prev, [index]: result.accuracyScore }));
    setWordTimings((prev) => ({
      ...prev,
      [index]: {
        offsetSec: 0,
        durationSec: 0,
        phonemeScores: result.phonemeScores,
      },
    }));
  }, []);

  useEffect(() => {
    return () => { stopRef.current?.(); };
  }, []);

  return {
    statuses,
    scores,
    wordTimings,
    listening,
    sessionDone,
    error,
    fluencyScore,
    nextWordIndex,
    startListening,
    stopListening,
    updateWordResult,
    setError,
  };
}
