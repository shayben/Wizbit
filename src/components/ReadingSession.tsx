import React, { useEffect, useState, useCallback, useMemo } from 'react';
import WordCard from './WordCard';
import WordPopup from './WordPopup';
import MomentOverlay from './MomentOverlay';
import { useAssessment } from '../hooks/useAssessment';
import { useRecording } from '../hooks/useRecording';
import { useMoments } from '../hooks/useMoments';
import type { WordResult } from '../services/speechService';
import { calculateGamificationScore } from '../services/gamificationService';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, batchTranslateText } from '../services/translationService';
import type { SupportedLanguage, WordTranslationMap } from '../services/translationService';
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
import { getStoryStats } from '../services/storyLibraryService';
import { startAmbient, stopAmbient } from '../services/audioService';
import { collectSticker } from '../services/stickerAlbumService';
import type { StickerRegistry } from '../services/stickerService';
import type { PreloadedMoment } from '../services/mediaService';

export type { WordTiming } from '../hooks/useAssessment';

interface ReadingSessionProps {
  text: string;
  momentCacheKey?: string;
  /** Story sticker registry for cross-chapter visual consistency. */
  stickerRegistry?: StickerRegistry;
  /** Known sticker labels from previous chapters (for AI context). */
  knownStickerLabels?: string[];
  /** Story title for sticker collection metadata. */
  storyTitle?: string;
  onReset: () => void;
}

const SENTENCE_END = /[.!?;:]["'"\u201D\u2019)\]]*$/;
const MAX_GROUP_WORDS = 25;
const MIN_GROUP_WORDS = 3;

/**
 * Split a flat word array into sentence-aligned groups.
 * Each group becomes one recognition window so restarts
 * happen at natural pauses instead of mid-sentence.
 */
function segmentBySentence(words: string[]): string[][] {
  if (words.length === 0) return [];

  const groups: string[][] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);

    const atSentenceEnd = SENTENCE_END.test(word);
    const longEnough = current.length >= MIN_GROUP_WORDS;
    const tooLong = current.length >= MAX_GROUP_WORDS;

    if ((atSentenceEnd && longEnough) || tooLong) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    // Merge a tiny remainder into the previous group
    if (groups.length > 0 && current.length < MIN_GROUP_WORDS) {
      groups[groups.length - 1].push(...current);
    } else {
      groups.push(current);
    }
  }

  return groups;
}

function tokenise(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

const ReadingSession: React.FC<ReadingSessionProps> = ({
  text, momentCacheKey, stickerRegistry, knownStickerLabels, storyTitle, onReset,
}) => {
  const { user } = useAuth();
  const words = useMemo(() => tokenise(text), [text]);
  const wordGroups = useMemo(() => segmentBySentence(words), [words]);

  const { recordingBlob, startRecording, pauseRecording, resumeRecording, stopRecording, cleanup: cleanupRecording } = useRecording();

  const {
    statuses, scores, wordTimings, listening, paused, sessionDone, error,
    fluencyScore, nextWordIndex, startListening: startAssessment,
    pauseListening: pauseAssessment, resumeListening: resumeAssessment,
    stopListening: stopAssessment, updateWordResult,
  } = useAssessment({
    words,
    wordGroups,
    onSessionDone: stopRecording,
  });

  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [immersive, setImmersive] = useState(true);

  // Translation language
  const [targetLang, setTargetLang] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [translationMap, setTranslationMap] = useState<WordTranslationMap>(new Map());

  // Batch-translate all words when text or language changes
  useEffect(() => {
    let cancelled = false;
    setTranslationMap(new Map());
    batchTranslateText(text, targetLang.code, targetLang.label)
      .then((map) => { if (!cancelled) setTranslationMap(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [text, targetLang]);

  // Newly awarded trophies (shown inline after session ends)
  const [newTrophies, setNewTrophies] = useState<Trophy[]>([]);

  // Immersive moments
  const { moments, momentIndices, storyTheme, loading: momentsLoading } = useMoments({
    words,
    momentCacheKey,
    enabled: immersive,
    stickerRegistry,
    knownStickerLabels,
  });

  // Collect stickers for the album as they trigger
  const handleStickerCollected = useCallback((moment: PreloadedMoment) => {
    if (!moment.stickerLabel) return;
    collectSticker({
      label: moment.stickerLabel,
      stickerUrl: moment.stickerUrl,
      stickerEmoji: moment.stickerEmoji,
      stickerSource: moment.stickerSource,
      caption: moment.caption,
      storyTitle,
    });
  }, [storyTitle]);

  // Manage ambient soundscape lifecycle
  useEffect(() => {
    if (immersive && listening && storyTheme) {
      startAmbient(storyTheme);
    } else {
      stopAmbient();
    }
    return () => { stopAmbient(); };
  }, [immersive, listening, storyTheme]);

  // Cleanup recording on unmount
  useEffect(() => cleanupRecording, [cleanupRecording]);

  const startListening = useCallback(async () => {
    setNewTrophies([]);
    await startRecording();
    startAssessment();
  }, [startRecording, startAssessment]);

  const pauseListening = useCallback(() => {
    pauseAssessment();
    pauseRecording();
  }, [pauseAssessment, pauseRecording]);

  const resumeListening = useCallback(() => {
    resumeRecording();
    resumeAssessment();
  }, [resumeRecording, resumeAssessment]);

  const stopListening = useCallback(() => {
    stopAssessment();
    stopRecording();
  }, [stopAssessment, stopRecording]);

  const handleWordClick = useCallback((_word: string, index: number) => {
    setSelectedWordIndex(index);
  }, []);

  const handlePracticeResult = useCallback((result: WordResult) => {
    if (selectedWordIndex === null) return;
    updateWordResult(selectedWordIndex, result);
  }, [selectedWordIndex, updateWordResult]);

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
      .filter(([, s]) => s === 'mispronounced' || s === 'skipped' || s === 'average')
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
        const newIds = computeNewTrophies(progress, earnedIds, getStoryStats(user.uid));
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

  const selectedWord = selectedWordIndex !== null ? words[selectedWordIndex] : null;
  const selectedTiming = selectedWordIndex !== null ? wordTimings[selectedWordIndex] : undefined;
  const selectedMoment = selectedWordIndex !== null
    ? moments.find((m) => selectedWordIndex >= m.wordIndex && selectedWordIndex <= m.fadeWordIndex)
    : undefined;

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
        ) : paused ? (
          <>
            <button
              type="button"
              onClick={resumeListening}
              className="flex-1 py-4 md:py-5 rounded-2xl bg-green-500 text-white font-bold text-xl md:text-2xl
                         active:bg-green-600 transition-colors shadow-md"
            >
              ▶ Resume
            </button>
            <button
              type="button"
              onClick={stopListening}
              className="py-4 md:py-5 px-5 md:px-6 rounded-2xl bg-red-500 text-white font-bold text-xl md:text-2xl
                         active:bg-red-600 transition-colors shadow-md"
            >
              ⏹
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={pauseListening}
              className="flex-1 py-4 md:py-5 rounded-2xl bg-amber-500 text-white font-bold text-xl md:text-2xl
                         active:bg-amber-600 transition-colors shadow-md"
            >
              ⏸ Pause
            </button>
            <button
              type="button"
              onClick={stopListening}
              className="py-4 md:py-5 px-5 md:px-6 rounded-2xl bg-red-500 text-white font-bold text-xl md:text-2xl
                         active:bg-red-600 transition-colors shadow-md animate-pulse"
            >
              ⏹
            </button>
          </>
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
                            p-2 w-48 md:w-52 max-h-72 overflow-y-auto">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => { setTargetLang(lang); setLangPickerOpen(false); }}
                  className={`flex items-center gap-2.5 w-full py-2 px-3 rounded-xl text-left transition-colors
                    ${lang.code === targetLang.code
                      ? 'bg-indigo-100'
                      : 'active:bg-gray-100'}`}
                >
                  <span className="text-lg shrink-0">{lang.flag}</span>
                  <span className="text-sm md:text-base text-gray-700 font-medium">{lang.label}</span>
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

      {immersive && (
        <p className={`text-xs md:text-sm text-center h-5 ${momentsLoading ? 'text-purple-400' : 'text-transparent'}`}>
          ✨ Preparing immersive experience…
        </p>
      )}

      {/* Reading area with sticker overlay container */}
      <div className="relative overflow-visible">
        {/* Reading text block */}
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

        {/* Animated sticker overlays — positioned in margins around the text */}
        {immersive && moments.length > 0 && (
          <MomentOverlay
            moments={moments}
            currentWordIndex={nextWordIndex}
            onStickerCollected={handleStickerCollected}
          />
        )}
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
          translationMap={translationMap}
          recordingBlob={recordingBlob}
          timing={selectedTiming}
          moment={selectedMoment}
          onPracticeResult={handlePracticeResult}
          onClose={() => setSelectedWordIndex(null)}
        />
      )}
    </div>
  );
};

export default ReadingSession;
