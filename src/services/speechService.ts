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
