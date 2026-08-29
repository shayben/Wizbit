import React, { useEffect, useState, useCallback, useRef } from 'react';
import SyllableBreakdown from './SyllableBreakdown';
import TranslationDisplay from './TranslationDisplay';
import PracticeButton from './PracticeButton';
import SoundItOut from './SoundItOut';
import { speakWord } from '../services/speechService';
import { cleanReadableWord, detectReadingLanguage, readingLocale } from '../services/phonicsService';
import type { WordResult } from '../services/speechService';
import type { WordTiming } from '../hooks/useAssessment';
import type { PreloadedMoment } from '../services/mediaService';
import type { WordTranslationMap } from '../services/translationService';

interface WordPopupProps {
  word: string;
  /** Surrounding text used to contextualise the translation. */
  sentence?: string;
  /** Target language code (default: 'he'). */
  targetLang?: string;
  /** Text direction of the target language. */
  textDir?: 'ltr' | 'rtl';
  /** Pre-computed word→translation map from batch translate. */
  translationMap?: WordTranslationMap;
  recordingBlob: Blob | null;
  timing?: WordTiming;
  /** Immersive moment data for this word, if any. */
  moment?: PreloadedMoment;
  /** Called when the user successfully practises the word. */
  onPracticeResult?: (result: WordResult) => void;
  onClose: () => void;
}

const WordPopup: React.FC<WordPopupProps> = ({ word, textDir = 'rtl', translationMap, recordingBlob, timing, moment, onPracticeResult, onClose }) => {
  const cleanWord = cleanReadableWord(word);
  const locale = readingLocale(word);
  const isEnglish = detectReadingLanguage(word) === 'en';
  const [playingBack, setPlayingBack] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const phonemeScores = timing?.phonemeScores ?? [];

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
    speakWord(cleanWord, locale);
  }, [cleanWord, locale]);

  return (
    <>
      {/* Backdrop — tap or press Escape to close */}
      <div
        className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="presentation"
      />
      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-label={`Word details: ${cleanWord}`}
        className="fixed bottom-0 inset-x-0 z-50 bg-indigo-50 rounded-t-3xl border-t border-indigo-100
                   p-4 md:p-6 pb-6 md:pb-8 shadow-lg max-h-[70vh] overflow-y-auto
                   animate-slide-up overscroll-contain"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
      {/* Header: word + close */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-2xl md:text-3xl font-bold text-indigo-700"
          dir={isEnglish ? 'ltr' : 'rtl'}
        >
          {cleanWord}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 text-xl md:text-2xl px-2 active:text-gray-600"
        >
          ✕
        </button>
      </div>

      <SoundItOut word={word} />

      {/* Azure's syllable scores currently apply to English assessment. */}
      {isEnglish && <SyllableBreakdown word={word} phonemeScores={phonemeScores} />}

      {/* Translation */}
      <TranslationDisplay word={word} translationMap={translationMap} textDir={textDir} />

      {/* Immersive moment media */}
      {moment && (
        <div className="mb-3 md:mb-4 rounded-xl bg-purple-50 border border-purple-100 p-3 md:p-4">
          <div className="flex items-start gap-3">
            {moment.stickerUrl ? (
              <img
                src={moment.stickerUrl}
                alt={moment.caption}
                className={`w-20 h-20 md:w-24 md:h-24 object-contain shrink-0
                  ${moment.stickerSource === 'wikipedia' ? 'rounded-xl shadow-sm' : 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.12)]'}`}
              />
            ) : moment.stickerEmoji ? (
              <span className="text-5xl md:text-6xl shrink-0 select-none" aria-hidden="true">
                {moment.stickerEmoji}
              </span>
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base text-purple-700 font-medium leading-snug">
                💡 {moment.caption}
              </p>
              {moment.soundEffect && (
                <button
                  type="button"
                  onClick={() => {
                    import('../services/audioService').then(({ playSoundEffect }) => {
                      playSoundEffect(moment.soundEffect!);
                    });
                  }}
                  className="mt-2 text-xs md:text-sm font-bold text-purple-600 bg-purple-100 rounded-lg
                             px-3 py-1.5 active:bg-purple-200 transition-colors"
                >
                  🔊 Play sound
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
        <PracticeButton word={word} locale={locale} onResult={onPracticeResult} />
      </div>
      </div>
    </>
  );
};

export default WordPopup;
