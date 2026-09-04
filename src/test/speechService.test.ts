import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setProperty: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  apiGet: mocks.apiGet,
}));

vi.mock('microsoft-cognitiveservices-speech-sdk', () => {
  class PronunciationAssessmentConfig {
    enableProsodyAssessment = false;
    applyTo = vi.fn();
  }

  class SpeechRecognizer {
    close = vi.fn();

    recognizeOnceAsync(success: (result: unknown) => void) {
      success({
        reason: 'recognized',
        properties: {
          getProperty: () => JSON.stringify({
            NBest: [{
              Words: [{
                Word: 'a',
                PronunciationAssessment: { AccuracyScore: 95, ErrorType: 'None' },
                Phonemes: [],
              }],
            }],
          }),
        },
      });
    }
  }

  return {
    SpeechConfig: {
      fromAuthorizationToken: () => ({
        speechRecognitionLanguage: '',
        setProperty: mocks.setProperty,
      }),
    },
    AudioConfig: { fromDefaultMicrophoneInput: vi.fn(() => ({})) },
    PronunciationAssessmentConfig,
    PronunciationAssessmentGradingSystem: { HundredMark: 'hundred-mark' },
    PronunciationAssessmentGranularity: { Phoneme: 'phoneme' },
    SpeechRecognizer,
    ResultReason: { RecognizedSpeech: 'recognized', NoMatch: 'no-match' },
    PropertyId: {
      SpeechServiceConnection_EndSilenceTimeoutMs: 'end-silence-timeout',
      SpeechServiceResponse_JsonResult: 'json-result',
    },
  };
});

import { assessWord } from '../services/speechService';

describe('assessWord', () => {
  beforeEach(() => {
    mocks.setProperty.mockClear();
    mocks.apiGet.mockResolvedValue({
      token: 'test-token',
      region: 'test-region',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
  });

  it('allows enough trailing silence to assess short sight words', async () => {
    const { promise } = assessWord('a');

    await expect(promise).resolves.toMatchObject({
      word: 'a',
      accuracyScore: 95,
    });
    expect(mocks.setProperty).toHaveBeenCalledWith('end-silence-timeout', '2000');
  });
});
