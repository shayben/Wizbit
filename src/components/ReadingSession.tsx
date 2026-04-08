import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import WordCard from './WordCard';
import WordPopup from './WordPopup';
import type { WordStatus } from './WordCard';
import { startPronunciationAssessment } from '../services/speechService';
import type { WordResult, AssessmentResult } from '../services/speechService';
import { calculateGamificationScore } from '../services/gamificationService';

export interface WordTiming {
  offsetSec: number;
  durationSec: number;
  phonemeScores: number[];
}

interface ReadingSessionProps {
  text: string;
  onReset: () => void;
}

function tokenise(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

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
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  // Audio recording state
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [wordTimings, setWordTimings] = useState<Record<number, WordTiming>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  const stopRef = useRef<(() => void) | null>(null);

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
    setWordTimings((prev) => ({
      ...prev,
      [idx]: {
        offsetSec: result.offsetSec,
        durationSec: result.durationSec,
        phonemeScores: result.phonemeScores,
      },
    }));
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

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setSessionDone(false);
    setStatuses({});
    setScores({});
    setFluencyScore(undefined);
    setWordTimings({});
    setRecordingBlob(null);
    matchPointer.current = {};
    chunksRef.current = [];

    // Start mic recording in parallel with the Speech SDK
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      const recorder = new MediaRecorder(micStream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setRecordingBlob(blob);
      };
      recorder.start();
    } catch {
      // Recording is optional — pronunciation assessment still works without it
    }

    try {
      const stop = startPronunciationAssessment(text, handleWordResult, handleDone, handleError);
      stopRef.current = stop;
      setListening(true);
    } catch (err) {
      stopRecording();
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [text, handleWordResult, handleDone, handleError, stopRecording]);

  const stopListening = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    stopRecording();
    setListening(false);
  }, [stopRecording]);

  useEffect(() => {
    return () => {
      stopRef.current?.();
      recorderRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleWordClick = useCallback((_word: string, index: number) => {
    setSelectedWordIndex(index);
  }, []);

  const gamificationScore = useMemo(
    () => calculateGamificationScore(words, statuses, scores, fluencyScore),
    [words, statuses, scores, fluencyScore],
  );

  const assessedCount = Object.keys(statuses).length;
  const correctCount = Object.values(statuses).filter((s) => s === 'correct').length;

  const selectedWord = selectedWordIndex !== null ? words[selectedWordIndex] : null;
  const selectedTiming = selectedWordIndex !== null ? wordTimings[selectedWordIndex] : undefined;

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto p-4">
      {/* Controls at the top */}
      <div className="flex gap-3">
        {!listening ? (
          <button
            type="button"
            onClick={startListening}
            className="flex-1 py-4 rounded-2xl bg-green-500 text-white font-bold text-xl
                       active:bg-green-600 transition-colors shadow-md"
          >
            🎤 {sessionDone ? 'Try Again!' : 'Read Aloud'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopListening}
            className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold text-xl
                       active:bg-red-600 transition-colors shadow-md animate-pulse"
          >
            ⏹ Done
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="py-4 px-5 rounded-2xl bg-gray-100 text-gray-500 font-bold text-xl
                     active:bg-gray-200 transition-colors"
          title="New photo"
        >
          📷
        </button>
      </div>

      {error && (
        <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* Reading area — looks like a paragraph in a textbook */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 min-h-40
                      text-xl leading-relaxed font-serif tracking-wide">
        {words.map((word, i) => (
          <React.Fragment key={i}>
            <WordCard
              word={word}
              index={i}
              status={statuses[i] ?? 'pending'}
              score={scores[i]}
              onClick={handleWordClick}
            />
            {' '}
          </React.Fragment>
        ))}
      </div>

      {/* Tap hint */}
      <p className="text-gray-400 text-xs text-center">Tap any word to learn it</p>

      {/* Progress bar — subtle, only while reading */}
      {assessedCount > 0 && !sessionDone && (
        <div className="w-full">
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-indigo-400 transition-all duration-300"
              style={{ width: `${Math.round((assessedCount / words.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Score card — shown after session ends */}
      {sessionDone && gamificationScore && !error && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-5 shadow-sm text-center">
          <p className="text-5xl mb-2">
            {'⭐'.repeat(gamificationScore.stars)}{'☆'.repeat(5 - gamificationScore.stars)}
          </p>
          <p className="text-4xl font-extrabold text-indigo-700">
            {gamificationScore.score}<span className="text-lg text-indigo-400"> / 100</span>
          </p>
          <p className="text-sm font-semibold text-indigo-600 mt-1">{gamificationScore.label}</p>
          <p className="text-indigo-700 font-medium text-sm mt-2">{gamificationScore.message}</p>
          <p className="text-gray-400 text-xs mt-2">
            {correctCount} of {assessedCount} words correct
            {gamificationScore.hardWordCount > 0 && (
              <> · {gamificationScore.hardWordCorrect} tricky words nailed!</>
            )}
          </p>
        </div>
      )}

      {/* Word popup (bottom sheet) */}
      {selectedWord && (
        <WordPopup
          word={selectedWord}
          recordingBlob={recordingBlob}
          timing={selectedTiming}
          onClose={() => setSelectedWordIndex(null)}
        />
      )}
    </div>
  );
};

export default ReadingSession;
