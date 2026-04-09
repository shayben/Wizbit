import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import WordCard from './WordCard';
import WordPopup from './WordPopup';
import MomentOverlay from './MomentOverlay';
import type { WordStatus } from './WordCard';
import { startWindowedPronunciationAssessment } from '../services/speechService';
import type { WordResult, AssessmentResult } from '../services/speechService';
import { calculateGamificationScore } from '../services/gamificationService';
import { analyzeTextForMoments } from '../services/momentsService';
import { preloadMoments } from '../services/mediaService';
import type { PreloadedMoment } from '../services/mediaService';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../services/translationService';
import type { SupportedLanguage } from '../services/translationService';
import { useAuth } from '../contexts/AuthContext';
import {
  saveSession,
  updatePracticeWords,
  loadUserProgress,
  loadTrophies,
  saveTrophies,
} from '../services/progressService';
import { computeNewTrophies, getTrophy } from '../services/trophyService';
import type { Trophy } from '../services/trophyService';

export interface WordTiming {
  offsetSec: number;
  durationSec: number;
  phonemeScores: number[];
}

interface ReadingSessionProps {
  text: string;
  onReset: () => void;
}

const WINDOW_SIZE = 5;

function tokenise(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

const ReadingSession: React.FC<ReadingSessionProps> = ({ text, onReset }) => {
  const { user } = useAuth();
  const words = useMemo(() => tokenise(text), [text]);

  const [statuses, setStatuses] = useState<Record<number, WordStatus>>({});
  const [scores, setScores] = useState<Record<number, number>>({});
  const [listening, setListening] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fluencyScore, setFluencyScore] = useState<number | undefined>(undefined);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  // Sequential cursor — tracks the next word to read
  const [nextWordIndex, setNextWordIndex] = useState(0);
  const nextWordRef = useRef(0);

  // Immersive moments
  const [immersive, setImmersive] = useState(true);
  const [moments, setMoments] = useState<PreloadedMoment[]>([]);
  const [momentsLoading, setMomentsLoading] = useState(false);

  // Translation language
  const [targetLang, setTargetLang] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  // Newly awarded trophies (shown inline after session ends)
  const [newTrophies, setNewTrophies] = useState<Trophy[]>([]);
  useEffect(() => {
    if (!immersive) return;
    let cancelled = false;
    setMomentsLoading(true);
    analyzeTextForMoments(words)
      .then((raw) => (!cancelled ? preloadMoments(raw) : []))
      .then((loaded) => { if (!cancelled) setMoments(loaded); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMomentsLoading(false); });
    return () => { cancelled = true; };
  }, [words, immersive]);

  // Audio recording state
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [wordTimings, setWordTimings] = useState<Record<number, WordTiming>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

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
    stopRecording();
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
    setNewTrophies([]);
    nextWordRef.current = 0;
    setNextWordIndex(0);
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
      const stop = startWindowedPronunciationAssessment(
        words,
        WINDOW_SIZE,
        handleWordResult,
        handleDone,
        handleError,
      );
      stopRef.current = stop;
      setListening(true);
    } catch (err) {
      stopRecording();
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [words, handleWordResult, handleDone, handleError, stopRecording]);

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

  const handlePracticeResult = useCallback((result: import('../services/speechService').WordResult) => {
    if (selectedWordIndex === null) return;
    const status: WordStatus =
      result.errorType === 'None' || result.accuracyScore >= 70 ? 'correct' : 'mispronounced';
    setStatuses((prev) => ({ ...prev, [selectedWordIndex]: status }));
    setScores((prev) => ({ ...prev, [selectedWordIndex]: result.accuracyScore }));
    setWordTimings((prev) => ({
      ...prev,
      [selectedWordIndex]: {
        offsetSec: 0,
        durationSec: 0,
        phonemeScores: result.phonemeScores,
      },
    }));
  }, [selectedWordIndex]);

  const gamificationScore = useMemo(
    () => calculateGamificationScore(words, statuses, scores, fluencyScore),
    [words, statuses, scores, fluencyScore],
  );

  // ── Persist session + award trophies when the session ends ──
  useEffect(() => {
    if (!sessionDone || !gamificationScore || !user) return;

    const sessionId = `${user.uid}_${Date.now()}`;
    const assessedStatuses = Object.entries(statuses);
    const wordsNeedPractice = assessedStatuses
      .filter(([, s]) => s === 'mispronounced' || s === 'skipped')
      .map(([i]) => words[Number(i)].replace(/[^a-zA-Z']/g, '').toLowerCase())
      .filter(Boolean);
    const wordsNowCorrect = assessedStatuses
      .filter(([, s]) => s === 'correct')
      .map(([i]) => words[Number(i)].replace(/[^a-zA-Z']/g, '').toLowerCase())
      .filter(Boolean);

    const accuracy =
      assessedStatuses.length > 0
        ? Math.round(
            (assessedStatuses.filter(([, s]) => s === 'correct').length / assessedStatuses.length) * 100,
          )
        : 0;

    (async () => {
      try {
        await saveSession(
          user.uid,
          sessionId,
          text,
          gamificationScore.score,
          gamificationScore.stars,
          accuracy,
          words.length,
          gamificationScore.hardWordCount,
          gamificationScore.hardWordCorrect,
          wordsNeedPractice,
        );

        const clearedCount = await updatePracticeWords(
          user.uid,
          wordsNeedPractice,
          wordsNowCorrect,
        );

        const progress = await loadUserProgress(user.uid);
        if (clearedCount > 0) {
          progress.practiceClearedCount = (progress.practiceClearedCount ?? 0) + clearedCount;
        }
        const existingTrophies = await loadTrophies(user.uid);
        const earnedIds = new Set(existingTrophies.map((t) => t.id));
        const newIds = computeNewTrophies(progress, earnedIds);
        if (newIds.length > 0) {
          await saveTrophies(user.uid, newIds);
          setNewTrophies(newIds.map((id) => getTrophy(id)!).filter(Boolean));
        }
      } catch { /* non-fatal — assessment data is already shown to the user */ }
    })();
    // Only run when sessionDone flips to true; other deps are stable at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDone]);

  const assessedCount = Object.keys(statuses).length;
  const correctCount = Object.values(statuses).filter((s) => s === 'correct').length;

  const momentIndices = useMemo(
    () => new Set(immersive ? moments.map((m) => m.wordIndex) : []),
    [moments, immersive],
  );

  const selectedWord = selectedWordIndex !== null ? words[selectedWordIndex] : null;
  const selectedTiming = selectedWordIndex !== null ? wordTimings[selectedWordIndex] : undefined;

  return (
    <div className="flex flex-col gap-4 md:gap-6 w-full max-w-lg md:max-w-2xl mx-auto p-4 md:p-8">
      {/* Controls at the top */}
      <div className="flex gap-3">
        {!listening ? (
          <button
            type="button"
            onClick={startListening}
            className="flex-1 py-4 md:py-5 rounded-2xl bg-green-500 text-white font-bold text-xl md:text-2xl
                       active:bg-green-600 transition-colors shadow-md"
          >
            🎤 {sessionDone ? 'Try Again!' : 'Read Aloud'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopListening}
            className="flex-1 py-4 md:py-5 rounded-2xl bg-red-500 text-white font-bold text-xl md:text-2xl
                       active:bg-red-600 transition-colors shadow-md animate-pulse"
          >
            ⏹ Done
          </button>
        )}
        <button
          type="button"
          onClick={() => setImmersive((v) => !v)}
          className={`py-4 md:py-5 px-5 md:px-6 rounded-2xl font-bold text-xl md:text-2xl transition-colors ${
            immersive
              ? 'bg-purple-100 text-purple-600'
              : 'bg-gray-100 text-gray-400'
          }`}
          title={immersive ? 'Immersive mode on' : 'Immersive mode off'}
        >
          ✨
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangPickerOpen((v) => !v)}
            className="py-4 md:py-5 px-5 md:px-6 rounded-2xl bg-gray-100 text-gray-500 font-bold text-xl md:text-2xl
                       active:bg-gray-200 transition-colors"
            title={`Translate to ${targetLang.label}`}
          >
            {targetLang.flag}
          </button>
          {langPickerOpen && (
            <div className="absolute top-full mt-1 right-0 z-40 bg-white rounded-2xl shadow-lg border border-gray-100
                            p-2 grid grid-cols-5 gap-1 min-w-[200px]">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => { setTargetLang(lang); setLangPickerOpen(false); }}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-center transition-colors
                    ${lang.code === targetLang.code
                      ? 'bg-indigo-100 border border-indigo-300'
                      : 'hover:bg-gray-50 active:bg-gray-100'}`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-[10px] md:text-xs text-gray-500 leading-tight">{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="py-4 md:py-5 px-5 md:px-6 rounded-2xl bg-gray-100 text-gray-500 font-bold text-xl md:text-2xl
                     active:bg-gray-200 transition-colors"
          title="Back"
        >
          ←
        </button>
      </div>

      {error && (
        <p className="text-red-600 text-sm md:text-base text-center bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {immersive && momentsLoading && (
        <p className="text-purple-400 text-xs md:text-sm text-center">✨ Preparing immersive experience…</p>
      )}

      {/* Immersive moment overlay (fixed-position, non-obstructive) */}
      {immersive && moments.length > 0 && (
        <MomentOverlay moments={moments} currentWordIndex={nextWordIndex} />
      )}

      {/* Reading area — looks like a paragraph in a textbook */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 md:px-8 py-4 md:py-6 min-h-40
                      text-xl md:text-2xl leading-relaxed md:leading-loose font-serif tracking-wide">
        {words.map((word, i) => (
          <React.Fragment key={i}>
            <WordCard
              word={word}
              index={i}
              status={statuses[i] ?? 'pending'}
              isNext={listening && i === nextWordIndex}
              hasMoment={momentIndices.has(i)}
              score={scores[i]}
              onClick={handleWordClick}
            />
            {' '}
          </React.Fragment>
        ))}
      </div>

      {/* Tap hint */}
      <p className="text-gray-400 text-xs md:text-sm text-center">Tap any word to learn it</p>

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
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-5 md:p-8 shadow-sm text-center">
          <p className="text-5xl md:text-6xl mb-2">
            {'⭐'.repeat(gamificationScore.stars)}{'☆'.repeat(5 - gamificationScore.stars)}
          </p>
          <p className="text-4xl md:text-5xl font-extrabold text-indigo-700">
            {gamificationScore.score}<span className="text-lg md:text-xl text-indigo-400"> / 100</span>
          </p>
          <p className="text-sm md:text-base font-semibold text-indigo-600 mt-1">{gamificationScore.label}</p>
          <p className="text-indigo-700 font-medium text-sm md:text-base mt-2">{gamificationScore.message}</p>
          <p className="text-gray-400 text-xs md:text-sm mt-2">
            {correctCount} of {assessedCount} words correct
            {gamificationScore.hardWordCount > 0 && (
              <> · {gamificationScore.hardWordCorrect} tricky words nailed!</>
            )}
          </p>
        </div>
      )}

      {/* New trophy notifications */}
      {newTrophies.length > 0 && (
        <div className="flex flex-col gap-2">
          {newTrophies.map((trophy) => (
            <div
              key={trophy.id}
              className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200
                         p-4 md:p-5 flex items-center gap-4 shadow-sm"
            >
              <span className="text-4xl md:text-5xl">{trophy.emoji}</span>
              <div>
                <p className="font-bold text-amber-700 text-base md:text-lg">🏆 Trophy Unlocked!</p>
                <p className="font-semibold text-amber-800 text-sm md:text-base">{trophy.name}</p>
                <p className="text-amber-600 text-xs md:text-sm">{trophy.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Word popup (bottom sheet) */}
      {selectedWord && (
        <WordPopup
          word={selectedWord}
          sentence={text}
          targetLang={targetLang.code}
          textDir={targetLang.dir}
          recordingBlob={recordingBlob}
          timing={selectedTiming}
          onPracticeResult={handlePracticeResult}
          onClose={() => setSelectedWordIndex(null)}
        />
      )}
    </div>
  );
};

export default ReadingSession;
