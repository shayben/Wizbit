/**
 * Azure Cognitive Services Speech service.
 *
 * Provides:
 *  - startPronunciationAssessment  – streams microphone audio and emits word-level
 *                                     accuracy scores via a callback.
 *  - speakWord                     – uses Speech Synthesis to pronounce a word aloud.
 */

import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

const SPEECH_KEY = import.meta.env.VITE_AZURE_SPEECH_KEY as string;
const SPEECH_REGION = import.meta.env.VITE_AZURE_SPEECH_REGION as string;

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

function getSpeechConfig(): SpeechSDK.SpeechConfig {
  if (!SPEECH_KEY || !SPEECH_REGION) {
    throw new Error(
      'Azure Speech credentials are not configured. ' +
      'Set VITE_AZURE_SPEECH_KEY and VITE_AZURE_SPEECH_REGION in your .env file.'
    );
  }
  return SpeechSDK.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
}

/**
 * Start a pronunciation assessment session.
 *
 * @param referenceText  The text the user is supposed to read.
 * @param onWord         Called each time a word result is available.
 * @param onDone         Called when the session ends with the full summary.
 * @param onError        Called on error.
 * @returns A stop function that ends the session.
 */
export function startPronunciationAssessment(
  referenceText: string,
  onWord: WordCallback,
  onDone: DoneCallback,
  onError: ErrorCallback,
): () => void {
  const speechConfig = getSpeechConfig();
  speechConfig.speechRecognitionLanguage = 'en-US';

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    referenceText,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );
  pronunciationConfig.enableProsodyAssessment = false;

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
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

        // Capture utterance-level fluency score when present.
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

        words.forEach(onWord);
      } catch {
        // ignore parse errors for individual results
      }
    }
  };

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
    recognizer.close();
  };

  recognizer.canceled = (_sender, event) => {
    if (event.reason === SpeechSDK.CancellationReason.Error) {
      onError(`Speech recognition error: ${event.errorDetails}`);
    }
    recognizer.close();
  };

  recognizer.startContinuousRecognitionAsync(
    () => { /* started */ },
    (err) => onError(String(err)),
  );

  return () => {
    recognizer.stopContinuousRecognitionAsync(
      () => recognizer.close(),
      (err) => {
        console.error('Error stopping recognizer:', err);
        recognizer.close();
      },
    );
  };
}

/**
 * Start a windowed pronunciation assessment.
 *
 * Instead of sending the entire text as the reference, the text is broken
 * into windows of `windowSize` words. Each window runs its own recognition
 * session. Word offsets are adjusted so they stay cumulative across windows
 * (aligned with a continuous audio recording).
 *
 * Insertions are filtered out — `onWord` only fires for reference words,
 * one at a time, in strict reading order.
 */
export function startWindowedPronunciationAssessment(
  words: string[],
  windowSize: number,
  onWord: WordCallback,
  onAllDone: DoneCallback,
  onError: ErrorCallback,
): () => void {
  let cursor = 0;
  let currentStop: (() => void) | null = null;
  let stopped = false;
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
    if (cursor >= words.length || stopped) {
      reportDone();
      return;
    }

    const windowText = words.slice(cursor, cursor + windowSize).join(' ');
    const windowCount = Math.min(windowSize, words.length - cursor);
    let processed = 0;
    let advancing = false;
    const elapsed = (Date.now() - t0) / 1000;

    const onWindowWord: WordCallback = (result) => {
      if (result.errorType === 'Insertion' || advancing || stopped) return;

      onWord({ ...result, offsetSec: result.offsetSec + elapsed });
      processed++;
      cursor++;

      if (processed >= windowCount) {
        advancing = true;
        currentStop?.();
      }
    };

    const onWindowDone: DoneCallback = (result) => {
      if (result.fluencyScore > 0) fluencyAll.push(result.fluencyScore);
      if (stopped) { reportDone(); return; }
      if (advancing) { startNextWindow(); return; }
      reportDone();
    };

    currentStop = startPronunciationAssessment(
      windowText,
      onWindowWord,
      onWindowDone,
      (err) => { if (!stopped) onError(err); },
    );
  }

  startNextWindow();

  return () => {
    stopped = true;
    currentStop?.();
  };
}

/** Synthesise and play the given word using Azure TTS. */
export function speakWord(word: string): void {
  const speechConfig = getSpeechConfig();
  speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';

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
export function assessWord(word: string): { promise: Promise<WordResult>; cancel: () => void } {
  const speechConfig = getSpeechConfig();
  speechConfig.speechRecognitionLanguage = 'en-US';

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

  const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
    word,
    SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
    SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
    true,
  );
  pronunciationConfig.enableProsodyAssessment = false;

  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  const promise = new Promise<WordResult>((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        recognizer.close();
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
      (err) => { recognizer.close(); reject(new Error(String(err))); },
    );
  });

  return {
    promise,
    cancel: () => recognizer.close(),
  };
}
