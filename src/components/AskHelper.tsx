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

  return (
    <div className="w-full max-w-xs md:max-w-md">
      {/* Section heading */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm md:text-base font-semibold text-indigo-700">
          Ask me to spell or translate
        </span>
        <button
          type="button"
          onClick={() => setShowLangPicker((v) => !v)}
          className="text-xl md:text-2xl px-2 py-1 rounded-lg active:bg-indigo-100"
          title={`Account language: ${accountLangLabel}`}
        >
          {accountLangFlag}
        </button>
      </div>

      {showLangPicker && (
        <div className="mb-3 grid grid-cols-5 gap-2 p-2 rounded-2xl bg-white border border-indigo-100 shadow-sm">
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
      )}

      {/* Mic button */}
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); if (phase === 'idle' || phase === 'error' || phase === 'result') handleStart(); }}
        onPointerUp={handleStop}
        onPointerCancel={handleStop}
        onPointerLeave={() => { if (phase === 'recording') handleStop(); }}
        disabled={phase === 'transcribing' || phase === 'thinking' || phase === 'translating'}
        className={`w-full py-4 md:py-5 rounded-2xl font-bold text-base md:text-lg
          flex items-center justify-center gap-2
          transition-colors select-none
          ${phase === 'recording'
            ? 'bg-red-500 text-white shadow-[0_0_0_8px_rgba(239,68,68,0.2)] animate-pulse'
            : phase === 'transcribing' || phase === 'thinking' || phase === 'translating'
              ? 'bg-indigo-200 text-indigo-700'
              : 'bg-indigo-100 text-indigo-700 active:bg-indigo-200'}`}
      >
        <span className="text-2xl" aria-hidden="true">
          {phase === 'recording' ? '⏺️' : '🎙️'}
        </span>
        <span>
          {phase === 'idle' && 'Hold to ask'}
          {phase === 'recording' && 'Listening… release to ask'}
          {phase === 'transcribing' && 'Hearing you…'}
          {phase === 'thinking' && 'Thinking…'}
          {phase === 'translating' && 'Translating…'}
          {phase === 'result' && 'Hold to ask again'}
          {phase === 'error' && 'Try again'}
        </span>
      </button>

      {/* Error / result panel */}
      {phase === 'error' && errorMsg && (
        <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          {errorMsg}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="mt-3 rounded-2xl bg-white border border-indigo-100 p-4 shadow-sm">
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
          <button
            type="button"
            onClick={reset}
            className="mt-3 text-xs md:text-sm text-indigo-600 active:text-indigo-700"
          >
            Clear
          </button>
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
