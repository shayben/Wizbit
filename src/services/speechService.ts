/**
 * Azure Cognitive Services Speech service.
 *
 * Provides:
 *  - startPronunciationAssessment  – streams microphone audio and emits word-level
 *                                     accuracy scores via a callback.
 *  - speakWord                     – uses Speech Synthesis to pronounce a word aloud.
 */

import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { apiGet } from './apiClient';

/* Server-issued ephemeral Azure Speech token cache. */
interface SpeechToken {
  token: string;
  region: string;
  expiresAt: number;
}
let cachedSpeechToken: SpeechToken | null = null;
let inflightTokenFetch: Promise<SpeechToken> | null = null;

async function fetchSpeechToken(): Promise<SpeechToken> {
  // Refresh ~1 minute before expiry.
  if (cachedSpeechToken && cachedSpeechToken.expiresAt - 60_000 > Date.now()) {
    return cachedSpeechToken;
  }
  if (inflightTokenFetch) return inflightTokenFetch;

  inflightTokenFetch = (async () => {
    try {
      const data = await apiGet<{ token: string; region: string; expiresAt: string }>(
        '/speech/token',
      );
      const tok: SpeechToken = {
        token: data.token,
        region: data.region,
        expiresAt: new Date(data.expiresAt).getTime(),
      };
      cachedSpeechToken = tok;
      return tok;
    } finally {
      inflightTokenFetch = null;
    }
  })();
  return inflightTokenFetch;
}

/** Map of recognition locale → default TTS neural voice. */
const VOICE_MAP: Record<string, string> = {
  'en-US': 'en-US-JennyNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'en-AU': 'en-AU-NatashaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'pt-BR': 'pt-BR-FranciscaNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'he-IL': 'he-IL-HilaNeural',
  'ar-SA': 'ar-SA-ZariyahNeural',
  'ru-RU': 'ru-RU-SvetlanaNeural',
};

const DEFAULT_LOCALE = 'en-US';

function resolveVoice(locale: string): string {
  return VOICE_MAP[locale] ?? VOICE_MAP[DEFAULT_LOCALE];
}

export interface WordResult {
  word: string;
  /** Accuracy score 0–100 (100 = perfect). */
  accuracyScore: number;
  /** Error type reported by the assessment engine, e.g. "None", "Omission", "Insertion", "Mispronunciation". */
  errorType: string;
  /** Start time of the word in seconds (from Azure Offset, converted from 100ns ticks). */
  offsetSec: number;
  /** Duration of the word in seconds (from Azure Duration, converted from 100ns ticks). */
  durationSec: number;
  /** Per-phoneme accuracy scores (0–100) in order. Empty if phoneme data unavailable. */
  phonemeScores: number[];
}

export interface AssessmentResult {
  words: WordResult[];
  pronunciationScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
}

type WordCallback = (word: WordResult) => void;
type DoneCallback = (result: AssessmentResult) => void;
type ErrorCallback = (error: string) => void;
/**
 * Called with interim recognition info. `absoluteWordCount` is the number of
 * words recognised so far measured against the ORIGINAL reference text, not
 * the current window slice. `interimText` is the raw interim transcript.
 */
export type RecognizingCallback = (absoluteWordCount: number, interimText: string) => void;
/**
 * Called for each `Insertion` word result. Useful for detecting off-script
 * reading. Insertions are still filtered out of the normal `onWord` stream
 * so they don't disturb per-word status tracking.
 */
export type InsertionCallback = (insertedWord: string, offsetSec: number) => void;

async function getSpeechConfig(): Promise<SpeechSDK.SpeechConfig> {
  const tok = await fetchSpeechToken();
  return SpeechSDK.SpeechConfig.fromAuthorizationToken(tok.token, tok.region);
}

/**
 * Start a pronunciation assessment session.
 *
 * @param referenceText   The text the user is supposed to read.
 * @param onWord          Called each time a word result is available.
 * @param onDone          Called when the session ends with the full summary.
 * @param onError         Called on error.
 * @param locale          BCP-47 recognition locale.
 * @param onRecognizing   Optional interim callback.
 * @param baseWordOffset  Offset (in words) from the start of the ORIGINAL reference
 *                        text to the start of `referenceText`. Used so interim word
 *                        counts reported via `onRecognizing` are absolute.
 * @param onInsertion     Optional callback invoked for each `Insertion` word result.
 * @returns A stop function that ends the session.
 */
export function startPronunciationAssessment(
  referenceText: string,
  onWord: WordCallback,
  onDone: DoneCallback,
  onError: ErrorCallback,
  locale: string = DEFAULT_LOCALE,
  onRecognizing?: RecognizingCallback,
  baseWordOffset = 0,
  onInsertion?: InsertionCallback,
): () => void {
  let recognizer: SpeechSDK.SpeechRecognizer | null = null;
  let cancelled = false;

  (async () => {
    let speechConfig: SpeechSDK.SpeechConfig;
    try {
      speechConfig = await getSpeechConfig();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Speech token fetch failed');
      return;
    }
    if (cancelled) return;
    speechConfig.speechRecognitionLanguage = locale;

    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

    const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
      referenceText,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      true,
    );
    pronunciationConfig.enableProsodyAssessment = false;

    recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationConfig.applyTo(recognizer);

    // Accumulate per-utterance fluency scores so we can average them at session end.
    const fluencyScores: number[] = [];

    recognizer.recognized = (_sender, event) => {
      if (event.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        const jsonResult = event.result.properties.getProperty(
          SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
        );
        if (!jsonResult) return;

        try {
          const parsed = JSON.parse(jsonResult);
          const nbest = parsed?.NBest?.[0];
          if (!nbest) return;

          const utteranceFluency = Number(
            (nbest.PronunciationAssessment as Record<string, unknown>)?.FluencyScore,
          );
          if (!isNaN(utteranceFluency) && utteranceFluency > 0) {
            fluencyScores.push(utteranceFluency);
          }

          const words: WordResult[] = (nbest.Words ?? []).map((w: Record<string, unknown>) => {
            const phonemes = (w.Phonemes as Record<string, unknown>[] | undefined) ?? [];
            const phonemeScores = phonemes.map((p) =>
              Number((p.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0),
            );
            return {
              word: String(w.Word ?? ''),
              accuracyScore: Number(
                (w.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0,
              ),
              errorType: String(
                (w.PronunciationAssessment as Record<string, unknown>)?.ErrorType ?? 'None',
              ),
              offsetSec: Number(w.Offset ?? 0) / 1e7,
              durationSec: Number(w.Duration ?? 0) / 1e7,
              phonemeScores,
            };
          });

          if (onInsertion) {
            for (const w of words) {
              if (w.errorType === 'Insertion') onInsertion(w.word, w.offsetSec);
            }
          }

          words.forEach(onWord);
        } catch {
          /* ignore parse errors for individual results */
        }
      }
    };

    if (onRecognizing) {
      recognizer.recognizing = (_sender, event) => {
        if (event.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
          const text = event.result.text ?? '';
          const wordCount = (text.match(/\S+/g) ?? []).length;
          if (wordCount > 0) onRecognizing(baseWordOffset + wordCount, text);
        }
      };
    }

    recognizer.sessionStopped = () => {
      const avgFluency =
        fluencyScores.length > 0
          ? fluencyScores.reduce((a, b) => a + b, 0) / fluencyScores.length
          : 0;
      onDone({
        words: [],
        pronunciationScore: 0,
        accuracyScore: 0,
        fluencyScore: avgFluency,
        completenessScore: 0,
      });
      recognizer?.close();
    };

    recognizer.canceled = (_sender, event) => {
      if (event.reason === SpeechSDK.CancellationReason.Error) {
        onError(`Speech recognition error: ${event.errorDetails}`);
      }
      recognizer?.close();
    };

    recognizer.startContinuousRecognitionAsync(
      () => { /* started */ },
      (err) => onError(String(err)),
    );

    if (cancelled) {
      recognizer.stopContinuousRecognitionAsync(() => recognizer?.close(), () => recognizer?.close());
    }
  })();

  return () => {
    cancelled = true;
    if (!recognizer) return;
    const r = recognizer;
    r.stopContinuousRecognitionAsync(
      () => r.close(),
      (err) => {
        console.error('Error stopping recognizer:', err);
        r.close();
      },
    );
  };
}

/**
 * Start a sentence-windowed pronunciation assessment.
 *
 * Each entry in `wordGroups` becomes one recognition window. Groups
 * should be aligned to sentence boundaries so that the recogniser
 * restarts at natural reading pauses rather than mid-sentence.
 *
 * Insertions are filtered out of the primary word stream — `onWord` only
 * fires for reference words, one at a time, in strict reading order — but
 * they are forwarded to `onInsertion` if provided.
 *
 * `baseWordOffset` is the absolute word index (into the original reference
 * text) at which `wordGroups[0]` begins. This is important when callers pass
 * a slice (e.g. after pause/resume or alignment-loss realign) so interim
 * word counts reported via `onRecognizing` remain absolute.
 */
export function startWindowedPronunciationAssessment(
  wordGroups: string[][],
  onWord: WordCallback,
  onAllDone: DoneCallback,
  onError: ErrorCallback,
  locale: string = DEFAULT_LOCALE,
  onRecognizing?: RecognizingCallback,
  baseWordOffset = 0,
  onInsertion?: InsertionCallback,
): () => void {
  let groupIdx = 0;
  let currentStop: (() => void) | null = null;
  let stopped = false;
  let stopping = false;
  let doneReported = false;
  const fluencyAll: number[] = [];
  const t0 = Date.now();

  function reportDone() {
    if (doneReported) return;
    doneReported = true;
    onAllDone({
      words: [],
      pronunciationScore: 0,
      accuracyScore: 0,
      fluencyScore:
        fluencyAll.length > 0
          ? fluencyAll.reduce((a, b) => a + b, 0) / fluencyAll.length
          : 0,
      completenessScore: 0,
    });
  }

  function startNextWindow() {
    if (groupIdx >= wordGroups.length || stopped) {
      reportDone();
      return;
    }

    const group = wordGroups[groupIdx];
    const windowText = group.join(' ');
    const windowCount = group.length;
    let processed = 0;
    let advancing = false;
    const elapsed = (Date.now() - t0) / 1000;

    // Compute how many words precede this window (absolute offset into original ref)
    let windowWordOffset = baseWordOffset;
    for (let i = 0; i < groupIdx; i++) windowWordOffset += wordGroups[i].length;

    const onWindowWord: WordCallback = (result) => {
      if (result.errorType === 'Insertion' || advancing || stopped) return;
      // While stopping, skip false omissions for words the child hasn't reached
      if (stopping && result.errorType === 'Omission') return;

      onWord({ ...result, offsetSec: result.offsetSec + elapsed });
      processed++;

      if (processed >= windowCount) {
        advancing = true;
        groupIdx++;
        currentStop?.();
      }
    };

    const onWindowDone: DoneCallback = (result) => {
      if (result.fluencyScore > 0) fluencyAll.push(result.fluencyScore);
      if (stopped) { reportDone(); return; }
      if (advancing) { startNextWindow(); return; }
      reportDone();
    };

    // Thread recognizing callback with absolute offset (incl. baseWordOffset)
    const onWindowRecognizing: RecognizingCallback | undefined = onRecognizing
      ? (absCount, interimText) => onRecognizing(absCount, interimText)
      : undefined;

    currentStop = startPronunciationAssessment(
      windowText,
      onWindowWord,
      onWindowDone,
      (err) => { if (!stopped) onError(err); },
      locale,
      onWindowRecognizing,
      windowWordOffset,
      onInsertion,
    );
  }

  startNextWindow();

  return () => {
    stopping = true;
    stopped = true;
    currentStop?.();
  };
}

/**
 * Free-form speech-to-text: listens to the microphone and returns the recognized text.
 * Returns a promise with the transcript and a cancel function.
 */
export function recognizeSpeech(locale: string = DEFAULT_LOCALE): { promise: Promise<string>; cancel: () => void } {
  let recognizer: SpeechSDK.SpeechRecognizer | null = null;
  let cancelled = false;

  const promise = new Promise<string>((resolve, reject) => {
    (async () => {
      let speechConfig: SpeechSDK.SpeechConfig;
      try {
        speechConfig = await getSpeechConfig();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Speech token fetch failed'));
        return;
      }
      if (cancelled) { resolve(''); return; }
      speechConfig.speechRecognitionLanguage = locale;

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer?.close();
          if (cancelled) { resolve(''); return; }
          if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            resolve(result.text);
          } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            reject(new Error('No speech detected — please try again.'));
          } else {
            reject(new Error('Speech recognition failed. Check your microphone.'));
          }
        },
        (err) => {
          recognizer?.close();
          reject(new Error(typeof err === 'string' ? err : 'Speech recognition error'));
        },
      );
    })();
  });

  const cancel = () => {
    cancelled = true;
    try { recognizer?.close(); } catch { /* already closed */ }
  };

  return { promise, cancel };
}

/** Synthesise and play the given word using Azure TTS. */
export async function speakWord(word: string, locale: string = DEFAULT_LOCALE): Promise<void> {
  let speechConfig: SpeechSDK.SpeechConfig;
  try {
    speechConfig = await getSpeechConfig();
  } catch (err) {
    console.error('TTS token error:', err);
    return;
  }
  speechConfig.speechSynthesisVoiceName = resolveVoice(locale);

  const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
  synthesizer.speakTextAsync(
    word,
    () => synthesizer.close(),
    (err) => {
      console.error('TTS error:', err);
      synthesizer.close();
    },
  );
}

/**
 * One-shot pronunciation assessment for a single word.
 * Returns a promise that resolves with the WordResult.
 */
export function assessWord(word: string, locale: string = DEFAULT_LOCALE): { promise: Promise<WordResult>; cancel: () => void } {
  let recognizer: SpeechSDK.SpeechRecognizer | null = null;
  let cancelled = false;

  const promise = new Promise<WordResult>((resolve, reject) => {
    (async () => {
      let speechConfig: SpeechSDK.SpeechConfig;
      try {
        speechConfig = await getSpeechConfig();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Speech token fetch failed'));
        return;
      }
      if (cancelled) { reject(new Error('cancelled')); return; }
      speechConfig.speechRecognitionLanguage = locale;

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
        word,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
        true,
      );
      pronunciationConfig.enableProsodyAssessment = false;

      recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
      pronunciationConfig.applyTo(recognizer);

      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer?.close();
          if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const json = result.properties.getProperty(
              SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult,
            );
            if (!json) { reject(new Error('No result')); return; }
            try {
              const parsed = JSON.parse(json);
              const nbest = parsed?.NBest?.[0];
              const w = nbest?.Words?.[0] as Record<string, unknown> | undefined;
              if (!w) { reject(new Error('No word result')); return; }

              const phonemes = (w.Phonemes as Record<string, unknown>[] | undefined) ?? [];
              resolve({
                word: String(w.Word ?? ''),
                accuracyScore: Number(
                  (w.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0,
                ),
                errorType: String(
                  (w.PronunciationAssessment as Record<string, unknown>)?.ErrorType ?? 'None',
                ),
                offsetSec: 0,
                durationSec: 0,
                phonemeScores: phonemes.map((p) =>
                  Number((p.PronunciationAssessment as Record<string, unknown>)?.AccuracyScore ?? 0),
                ),
              });
            } catch { reject(new Error('Parse error')); }
          } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            reject(new Error('No speech detected — try again'));
          } else {
            reject(new Error('Recognition failed'));
          }
        },
        (err) => { recognizer?.close(); reject(new Error(String(err))); },
      );
    })();
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      try { recognizer?.close(); } catch { /* already closed */ }
    },
  };
}
