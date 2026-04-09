import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { splitSyllables } from '../services/syllableService';
import { translateWordInContext, translateWord } from '../services/translationService';
import { speakWord, assessWord } from '../services/speechService';
import type { WordResult } from '../services/speechService';
import type { WordTiming } from './ReadingSession';

interface WordPopupProps {
  word: string;
  /** Surrounding text used to contextualise the translation. */
  sentence?: string;
  /** Target language code (default: 'he'). */
  targetLang?: string;
  /** Text direction of the target language. */
  textDir?: 'ltr' | 'rtl';
  recordingBlob: Blob | null;
  timing?: WordTiming;
  /** Called when the user successfully practises the word. */
  onPracticeResult?: (result: WordResult) => void;
  onClose: () => void;
}

/**
 * Distribute phoneme scores across syllables proportionally by character count.
 * Returns an average accuracy score (0–100) per syllable.
 */
function syllableScores(syllables: string[], phonemeScores: number[]): number[] {
  if (phonemeScores.length === 0) return [];

  const totalChars = syllables.reduce((s, syl) => s + syl.length, 0);
  const scores: number[] = [];
  let phonemeIdx = 0;

  for (const syl of syllables) {
    // How many phonemes this syllable "owns", proportional to its character share
    const share = (syl.length / totalChars) * phonemeScores.length;
    const count = Math.max(1, Math.round(share));
    const slice = phonemeScores.slice(phonemeIdx, phonemeIdx + count);
    phonemeIdx += count;
    const avg = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    scores.push(Math.round(avg));
  }

  // If rounding left over phonemes, fold them into the last syllable
  if (phonemeIdx < phonemeScores.length) {
    const remaining = phonemeScores.slice(phonemeIdx);
    const last = scores[scores.length - 1];
    const combined = [...remaining, last];
    scores[scores.length - 1] = Math.round(combined.reduce((a, b) => a + b, 0) / combined.length);
  }

  return scores;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 50) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

function scoreEmoji(score: number): string {
  if (score >= 80) return '✅';
  if (score >= 50) return '🔶';
  return '❌';
}

const WordPopup: React.FC<WordPopupProps> = ({ word, sentence, targetLang = 'he', textDir = 'rtl', recordingBlob, timing, onPracticeResult, onClose }) => {
  const cleanWord = word.replace(/[^a-zA-Z']/g, '');
  const syllables = splitSyllables(cleanWord);
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(true);
  const [playingBack, setPlayingBack] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // Practice state
  const [practicing, setPracticing] = useState(false);
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const [practicePhonemes, setPracticePhonemes] = useState<number[]>([]);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const activePhonemes = practicePhonemes.length > 0 ? practicePhonemes : (timing?.phonemeScores ?? []);
  const sylScores = useMemo(
    () => syllableScores(syllables, activePhonemes),
    [syllables, activePhonemes],
  );
  const hasAssessment = sylScores.length > 0;

  useEffect(() => {
    let cancelled = false;
    setTranslated(null);
    setTranslating(true);

    const promise = sentence
      ? translateWordInContext(word, sentence, targetLang)
      : translateWord(cleanWord, targetLang);

    promise
      .then((r) => {
        if (!cancelled) setTranslated(r.translation);
      })
      .catch(() => {
        if (!cancelled) setTranslated(null);
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => { cancelled = true; };
  }, [cleanWord, word, sentence, targetLang]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelRef.current?.();
    };
  }, []);

  const hasRecording = !!recordingBlob && !!timing && timing.durationSec > 0;

  const handlePractice = useCallback(async () => {
    setPracticing(true);
    setPracticeScore(null);
    setPracticePhonemes([]);
    setPracticeError(null);

    const { promise, cancel } = assessWord(cleanWord);
    cancelRef.current = cancel;

    try {
      const result = await promise;
      setPracticeScore(Math.round(result.accuracyScore));
      setPracticePhonemes(result.phonemeScores);
      onPracticeResult?.(result);
    } catch (err) {
      setPracticeError(err instanceof Error ? err.message : 'Try again');
    } finally {
      setPracticing(false);
      cancelRef.current = null;
    }
  }, [cleanWord, onPracticeResult]);

  const handlePlayRecording = useCallback(() => {
    if (!recordingBlob || !timing) return;

    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
    }

    const url = URL.createObjectURL(recordingBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingBack(true);

    const buffer = 0.15;
    const startTime = Math.max(0, timing.offsetSec - buffer);
    const playDuration = timing.durationSec + buffer * 2;

    audio.currentTime = startTime;
    audio.play().catch(() => setPlayingBack(false));

    timerRef.current = window.setTimeout(() => {
      audio.pause();
      setPlayingBack(false);
      URL.revokeObjectURL(url);
    }, playDuration * 1000);

    audio.onended = () => {
      setPlayingBack(false);
      URL.revokeObjectURL(url);
    };
  }, [recordingBlob, timing]);

  const handlePlayCorrect = useCallback(() => {
    speakWord(cleanWord);
  }, [cleanWord]);

  return (
    <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 md:p-6 shadow-sm">
      {/* Header: word + close */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl md:text-3xl font-bold text-indigo-700">{cleanWord}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 text-xl md:text-2xl px-2 active:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Syllable accuracy breakdown */}
      <div className="mb-3 md:mb-4">
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          {syllables.map((syl, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-300 text-lg md:text-xl mx-0.5">·</span>}
              <span
                className={`text-xl md:text-2xl font-semibold px-2 py-0.5 rounded-lg transition-colors ${
                  hasAssessment ? scoreColor(sylScores[i]) : 'text-gray-700'
                }`}
              >
                {syl}
              </span>
            </React.Fragment>
          ))}
        </div>

        {hasAssessment && (
          <div className="flex items-center gap-1 md:gap-2 mt-1.5 flex-wrap">
            {syllables.map((_syl, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="w-4" />}
                <span className="text-xs md:text-sm font-medium text-gray-500 text-center min-w-7">
                  {scoreEmoji(sylScores[i])} {sylScores[i]}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Translation */}
      <div className="mb-3 md:mb-4 min-h-7">
        {translating ? (
          <span className="text-gray-400 text-sm md:text-base">Translating…</span>
        ) : translated ? (
          <span className="text-xl md:text-2xl font-medium text-gray-600" dir={textDir}>{translated}</span>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 md:gap-3 flex-wrap">
        {hasRecording && (
          <button
            type="button"
            onClick={handlePlayRecording}
            disabled={playingBack}
            className={`flex-1 py-2.5 md:py-3 rounded-xl font-bold text-base md:text-lg transition-colors ${
              playingBack
                ? 'bg-amber-200 text-amber-700'
                : 'bg-amber-400 text-amber-900 active:bg-amber-500'
            }`}
          >
            {playingBack ? '🔊 Playing…' : '🎙️ How I Said It'}
          </button>
        )}
        <button
          type="button"
          onClick={handlePlayCorrect}
          className="flex-1 py-2.5 md:py-3 rounded-xl bg-indigo-500 text-white font-bold text-base md:text-lg
                     active:bg-indigo-600 transition-colors"
        >
          🔊 Hear it
        </button>
        <button
          type="button"
          onClick={handlePractice}
          disabled={practicing}
          className={`w-full py-2.5 md:py-3 rounded-xl font-bold text-base md:text-lg transition-colors ${
            practicing
              ? 'bg-green-200 text-green-700 animate-pulse'
              : 'bg-green-500 text-white active:bg-green-600'
          }`}
        >
          {practicing ? '🎤 Listening…' : '🎤 Practice this word'}
        </button>
      </div>

      {/* Practice feedback */}
      {practiceScore !== null && (
        <div className={`mt-2 text-center py-2 md:py-3 rounded-xl font-bold text-base md:text-lg ${
          practiceScore >= 80
            ? 'bg-green-50 text-green-700'
            : practiceScore >= 50
              ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700'
        }`}>
          {practiceScore >= 80 ? '🎉 Great job!' : practiceScore >= 50 ? '👍 Getting closer!' : '💪 Try again!'}{' '}
          Score: {practiceScore}
        </div>
      )}
      {practiceError && (
        <div className="mt-2 text-center py-2 rounded-xl bg-gray-50 text-gray-500 text-sm md:text-base">
          {practiceError}
        </div>
      )}
    </div>
  );
};

export default WordPopup;
