import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { splitSyllables } from '../services/syllableService';
import { translateWordInContext, translateToHebrew } from '../services/translationService';
import { speakWord } from '../services/speechService';
import type { WordTiming } from './ReadingSession';

interface WordPopupProps {
  word: string;
  /** Surrounding text used to contextualise the Hebrew translation. */
  sentence?: string;
  recordingBlob: Blob | null;
  timing?: WordTiming;
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

const WordPopup: React.FC<WordPopupProps> = ({ word, sentence, recordingBlob, timing, onClose }) => {
  const cleanWord = word.replace(/[^a-zA-Z']/g, '');
  const syllables = splitSyllables(cleanWord);
  const [hebrew, setHebrew] = useState<string | null>(null);
  const [translating, setTranslating] = useState(true);
  const [playingBack, setPlayingBack] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const phonemeScores = timing?.phonemeScores ?? [];
  const sylScores = useMemo(
    () => syllableScores(syllables, phonemeScores),
    [syllables, phonemeScores],
  );
  const hasAssessment = sylScores.length > 0;

  useEffect(() => {
    let cancelled = false;
    const promise = sentence
      ? translateWordInContext(word, sentence)
      : translateToHebrew(cleanWord);

    promise
      .then((r) => {
        if (!cancelled) setHebrew(r.hebrew);
      })
      .catch(() => {
        if (!cancelled) setHebrew(null);
      })
      .finally(() => {
        if (!cancelled) setTranslating(false);
      });
    return () => { cancelled = true; };
  }, [cleanWord, word, sentence]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const hasRecording = !!recordingBlob && !!timing && timing.durationSec > 0;

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
    <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 shadow-sm">
      {/* Header: word + close */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl font-bold text-indigo-700">{cleanWord}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 text-xl px-2 active:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Syllable accuracy breakdown */}
      <div className="mb-3">
        <div className="flex items-center gap-1 flex-wrap">
          {syllables.map((syl, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-300 text-lg mx-0.5">·</span>}
              <span
                className={`text-xl font-semibold px-2 py-0.5 rounded-lg transition-colors ${
                  hasAssessment ? scoreColor(sylScores[i]) : 'text-gray-700'
                }`}
              >
                {syl}
              </span>
            </React.Fragment>
          ))}
        </div>

        {hasAssessment && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {syllables.map((_syl, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="w-4" />}
                <span className="text-xs font-medium text-gray-500 text-center min-w-7">
                  {scoreEmoji(sylScores[i])} {sylScores[i]}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Hebrew translation */}
      <div className="mb-3 min-h-7">
        {translating ? (
          <span className="text-gray-400 text-sm">Translating…</span>
        ) : hebrew ? (
          <span className="text-xl font-medium text-gray-600" dir="rtl">{hebrew}</span>
        ) : null}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {hasRecording && (
          <button
            type="button"
            onClick={handlePlayRecording}
            disabled={playingBack}
            className={`flex-1 py-2.5 rounded-xl font-bold text-base transition-colors ${
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
          className={`${hasRecording ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-base
                     active:bg-indigo-600 transition-colors`}
        >
          🔊 Hear it
        </button>
      </div>
    </div>
  );
};

export default WordPopup;
