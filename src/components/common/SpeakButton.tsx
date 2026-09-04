/**
 * SpeakButton — read any text aloud.
 *
 * The bridge that lets a child attempt work they cannot yet read: a first
 * grader can solve a word problem that is beyond their decoding level once
 * they can hear it. Used by word problems, spelling dictation, sight words and
 * comprehension questions.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { speakWord } from '../../services/speechService';

export interface SpeakButtonProps {
  text: string;
  locale?: string;
  /** Visual weight: `icon` for a round button, `full` for a labelled bar. */
  variant?: 'icon' | 'full';
  label?: string;
  /** Speak automatically when the text changes (dictation). */
  autoSpeak?: boolean;
  className?: string;
}

const SpeakButton: React.FC<SpeakButtonProps> = ({
  text,
  locale = 'en-US',
  variant = 'icon',
  label = 'Read aloud',
  autoSpeak = false,
  className = '',
}) => {
  const [speaking, setSpeaking] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const speak = useCallback(async () => {
    if (!text.trim()) return;
    setSpeaking(true);
    try {
      await speakWord(text, locale);
    } catch { /* TTS unavailable — the text is still on screen */ }
    if (mountedRef.current) setSpeaking(false);
  }, [text, locale]);

  // Speak once whenever the target text changes, when asked to.
  //
  // This deliberately calls the service rather than `speak`: the button's busy
  // state belongs to presses the child makes, and driving it from an effect
  // would update state synchronously during the effect.
  useEffect(() => {
    if (!autoSpeak || !text.trim()) return;
    void speakWord(text, locale).catch(() => { /* TTS unavailable */ });
  }, [autoSpeak, text, locale]);

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={speak}
        disabled={speaking || !text.trim()}
        className={`w-full py-3 md:py-4 rounded-2xl bg-sky-100 text-sky-700 font-bold text-base md:text-lg
                    active:bg-sky-200 disabled:opacity-60 transition-colors ${className}`}
      >
        {speaking ? '🔊 Speaking…' : `🔊 ${label}`}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={speak}
      disabled={speaking || !text.trim()}
      aria-label={label}
      className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-full bg-sky-100 text-sky-700 text-xl md:text-2xl
                  grid place-items-center active:bg-sky-200 disabled:opacity-60 transition-colors ${className}`}
    >
      {speaking ? '🔈' : '🔊'}
    </button>
  );
};

export default SpeakButton;
