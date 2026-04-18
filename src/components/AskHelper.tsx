/**
 * AskHelper — home-screen voice helper.
 *
 * Tap the mic, speak a single word in English or the account language
 * (or a mix — Whisper handles code-switching), and the helper either
 * spells the word out as big letter tiles or shows a translation card.
 *
 * Output is visual only by design: no TTS playback.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';
import { classifyIntent, type AskClassification } from '../services/askService';
import { translateWord, SUPPORTED_LANGUAGES } from '../services/translationService';
import { setAccountLanguage } from '../services/progressService';

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'translating' | 'result' | 'error';

interface AskHelperProps {
  /** Signed-in user's uid, or null/undefined for anonymous. */
  uid?: string | null;
  /** Persisted account language (e.g. 'he'). */
  accountLanguage: string;
  /** Called when the language picker changes so the parent can refresh. */
  onAccountLanguageChange?: (code: string) => void;
}

interface AskResult {
  classification: AskClassification;
  /** Populated for translate intent only. */
  translation?: string;
}

function dirForLang(code: string): 'ltr' | 'rtl' {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return found?.dir ?? 'ltr';
}

function labelForLang(code: string): string {
  if (code === 'en') return 'English';
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

const AskHelper: React.FC<AskHelperProps> = ({ uid, accountLanguage, onAccountLanguageChange }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const recorderRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);

  // Release any in-flight recorder on unmount.
  useEffect(() => {
    return () => recorderRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    setPhase('idle');
    setErrorMsg(null);
    setResult(null);
  }, []);

  const stopAndProcess = useCallback(async (
    stopped: Promise<Blob>,
    accountLangLabel: string,
  ) => {
    try {
      const blob = await stopped;
      if (blob.size < 200) {
        setErrorMsg('I didn\'t catch that — try holding the button a bit longer.');
        setPhase('error');
        return;
      }

      setPhase('transcribing');
      const { text } = await transcribeAudio(blob);
      if (!text) {
        setErrorMsg('I didn\'t catch that — try again.');
        setPhase('error');
        return;
      }

      setPhase('thinking');
      const classification = await classifyIntent(text, accountLanguage, accountLangLabel);

      if (classification.intent === 'unknown' || !classification.word) {
        setErrorMsg('I\'m not sure what you asked. Try "spell elephant" or "what is cat in Hebrew".');
        setPhase('error');
        return;
      }

      if (classification.intent === 'translate') {
        setPhase('translating');
        const { translation } = await translateWord(classification.word, classification.targetLang);
        setResult({ classification, translation });
        setPhase('result');
        return;
      }

      // spell
      setResult({ classification });
      setPhase('result');
    } catch (err) {
      // Surface ApiError upstream body for debuggability — esp. helpful when
      // Whisper rejects an audio format and the proxy returns 502.
      let msg = err instanceof Error ? err.message : 'Something went wrong.';
      if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
        const body = (err as { body?: unknown }).body;
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        msg = `${msg} — ${bodyStr.slice(0, 300)}`;
        console.error('AskHelper API error', err);
      }
      if (msg === 'cancelled') { reset(); return; }
      setErrorMsg(msg);
      setPhase('error');
    } finally {
      recorderRef.current = null;
    }
  }, [accountLanguage, reset]);

  const handleStart = useCallback(async () => {
    setErrorMsg(null);
    setResult(null);
    setPhase('recording');
    const accountLangLabel = labelForLang(accountLanguage);

    try {
      const recorder = await recordAudioClip();
      recorderRef.current = { stop: recorder.stop, cancel: recorder.cancel };
      stopAndProcess(recorder.stopped, accountLangLabel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone unavailable.';
      setErrorMsg(`Can't access the microphone: ${msg}`);
      setPhase('error');
    }
  }, [accountLanguage, stopAndProcess]);

  const handleStop = useCallback(() => {
    if (phase === 'recording') {
      recorderRef.current?.stop();
    }
  }, [phase]);

  const handlePickLanguage = useCallback(async (code: string) => {
    setShowLangPicker(false);
    if (code === accountLanguage) return;
    await setAccountLanguage(uid, code);
    onAccountLanguageChange?.(code);
  }, [uid, accountLanguage, onAccountLanguageChange]);

  const accountLangFlag = SUPPORTED_LANGUAGES.find((l) => l.code === accountLanguage)?.flag ?? '🌐';
  const accountLangLabel = labelForLang(accountLanguage);

  const overlayOpen =
    phase === 'recording' ||
    phase === 'transcribing' ||
    phase === 'thinking' ||
    phase === 'translating' ||
    phase === 'result' ||
    phase === 'error' ||
    showLangPicker;

  const statusLabel =
    phase === 'recording' ? 'Listening… release to ask'
    : phase === 'transcribing' ? 'Hearing you…'
    : phase === 'thinking' ? 'Thinking…'
    : phase === 'translating' ? 'Translating…'
    : 'Hold to ask';

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Circular mic button — matches camera button style, smaller. */}
      <div className="relative">
        <button
          type="button"
          aria-label="Hold to ask Wizbit to spell or translate a word"
          onPointerDown={(e) => {
            e.preventDefault();
            if (phase === 'idle' || phase === 'error' || phase === 'result') handleStart();
          }}
          onPointerUp={handleStop}
          onPointerCancel={handleStop}
          onPointerLeave={() => { if (phase === 'recording') handleStop(); }}
          disabled={phase === 'transcribing' || phase === 'thinking' || phase === 'translating'}
          className={`group w-20 h-20 md:w-24 md:h-24 rounded-full
                     flex items-center justify-center select-none
                     transition-all duration-100 ease-out border
                     shadow-[0_6px_20px_rgba(79,70,229,0.45),inset_0_2px_4px_rgba(255,255,255,0.25),inset_0_-2px_4px_rgba(0,0,0,0.2)]
                     active:shadow-[0_2px_8px_rgba(79,70,229,0.3),inset_0_-1px_2px_rgba(255,255,255,0.15),inset_0_2px_6px_rgba(0,0,0,0.25)]
                     active:translate-y-0.5 active:scale-[0.97]
                     ${phase === 'recording'
                       ? 'bg-gradient-to-b from-red-400 via-red-500 to-red-600 border-red-500/40 animate-pulse'
                       : 'bg-gradient-to-b from-indigo-400 via-indigo-600 to-indigo-700 border-indigo-500/30'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"
               className="w-9 h-9 md:w-10 md:h-10 drop-shadow-[0_2px_2px_rgba(0,0,0,0.2)]
                          group-active:scale-90 transition-transform duration-100">
            <path d="M12 1.5a3.75 3.75 0 00-3.75 3.75v6a3.75 3.75 0 007.5 0v-6A3.75 3.75 0 0012 1.5z" />
            <path d="M5.25 10.5a.75.75 0 011.5 0v.75a5.25 5.25 0 1010.5 0v-.75a.75.75 0 011.5 0v.75a6.75 6.75 0 01-6 6.71V21h2.25a.75.75 0 010 1.5h-6a.75.75 0 010-1.5h2.25v-2.79a6.75 6.75 0 01-6-6.71v-.75z" />
          </svg>
        </button>

        {/* Account language flag badge — opens picker on tap. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowLangPicker((v) => !v); }}
          className="absolute -bottom-1 -right-1 w-7 h-7 md:w-8 md:h-8 rounded-full
                     bg-white shadow-md border border-indigo-100
                     flex items-center justify-center text-base md:text-lg
                     active:bg-indigo-50"
          title={`Account language: ${accountLangLabel}`}
          aria-label={`Account language: ${accountLangLabel}. Tap to change.`}
        >
          {accountLangFlag}
        </button>
      </div>

      <p className="text-gray-400 text-sm md:text-base">{statusLabel}</p>

      {/* Floating overlay — modal-ish card centered on screen. */}
      {overlayOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end md:items-center justify-center
                     bg-black/30 p-4 animate-fade-in"
          onClick={() => {
            // Tap outside dismisses lang picker / result / error, but never an in-flight op.
            if (phase === 'recording' || phase === 'transcribing' || phase === 'thinking' || phase === 'translating') return;
            setShowLangPicker(false);
            if (phase === 'result' || phase === 'error') reset();
          }}
        >
          <div
            className="w-full max-w-sm md:max-w-md rounded-3xl bg-white p-4 md:p-5 shadow-2xl
                       border border-indigo-100 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Language picker */}
            {showLangPicker && (
              <div>
                <div className="text-sm font-semibold text-indigo-700 mb-2">Account language</div>
                <div className="grid grid-cols-5 gap-2">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handlePickLanguage(lang.code)}
                      className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs
                        ${lang.code === accountLanguage
                          ? 'bg-indigo-100 ring-2 ring-indigo-400'
                          : 'active:bg-indigo-50'}`}
                      title={lang.label}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-[10px] md:text-xs text-gray-600">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* In-flight status */}
            {!showLangPicker && (phase === 'recording' || phase === 'transcribing' || phase === 'thinking' || phase === 'translating') && (
              <div className="flex items-center gap-3 py-2">
                <span className="text-3xl">{phase === 'recording' ? '⏺️' : '🎙️'}</span>
                <span className="text-base md:text-lg font-semibold text-indigo-700">{statusLabel}</span>
              </div>
            )}

            {/* Error */}
            {!showLangPicker && phase === 'error' && errorMsg && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                {errorMsg}
              </div>
            )}

            {/* Result */}
            {!showLangPicker && phase === 'result' && result && (
              <div>
                {result.classification.intent === 'spell' ? (
                  <SpellResult word={result.classification.word} lang={result.classification.sourceLang} />
                ) : (
                  <TranslateResult
                    source={result.classification.word}
                    sourceLang={result.classification.sourceLang}
                    target={result.translation ?? ''}
                    targetLang={result.classification.targetLang}
                  />
                )}
              </div>
            )}

            {/* Dismiss row (hidden during in-flight) */}
            {(phase === 'result' || phase === 'error' || showLangPicker) && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => { setShowLangPicker(false); if (phase === 'result' || phase === 'error') reset(); }}
                  className="text-sm text-indigo-600 active:text-indigo-700 font-semibold px-3 py-1"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SpellResult: React.FC<{ word: string; lang: string }> = ({ word, lang }) => {
  const dir = dirForLang(lang);
  // For RTL scripts we keep tile order but flex direction reverses so the
  // first letter visually appears on the right.
  const letters = Array.from(word);
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Spell</div>
      <div
        className={`flex flex-wrap gap-1.5 md:gap-2 ${dir === 'rtl' ? 'flex-row-reverse justify-end' : ''}`}
        dir={dir}
      >
        {letters.map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            className="inline-flex items-center justify-center w-10 h-12 md:w-12 md:h-14
                       rounded-xl bg-indigo-500 text-white text-2xl md:text-3xl font-bold
                       shadow-[0_2px_4px_rgba(79,70,229,0.35)]
                       animate-fade-in"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}
          >
            {ch.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
};

const TranslateResult: React.FC<{
  source: string;
  sourceLang: string;
  target: string;
  targetLang: string;
}> = ({ source, sourceLang, target, targetLang }) => {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Translate · {labelForLang(sourceLang)} → {labelForLang(targetLang)}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="text-2xl md:text-3xl font-bold text-gray-700"
          dir={dirForLang(sourceLang)}
        >
          {source}
        </span>
        <span className="text-2xl text-indigo-400" aria-hidden="true">→</span>
        <span
          className="text-2xl md:text-3xl font-bold text-indigo-700"
          dir={dirForLang(targetLang)}
        >
          {target || '—'}
        </span>
      </div>
    </div>
  );
};

export default AskHelper;
