import { describe, expect, it } from 'vitest';
import {
  cleanReadableWord,
  detectReadingLanguage,
  getSoundParts,
  readingLocale,
} from '../services/phonicsService';

describe('phonicsService', () => {
  it('splits simple English words into first-grade letter sounds', () => {
    expect(getSoundParts('cat.')).toEqual([
      { text: 'c', phoneme: 'k' },
      { text: 'a', phoneme: 'æ' },
      { text: 't', phoneme: 't' },
    ]);
  });

  it('keeps common English phonograms together', () => {
    expect(getSoundParts('ship').map((part) => part.text)).toEqual(['sh', 'i', 'p']);
    expect(getSoundParts('duck').map((part) => part.text)).toEqual(['d', 'u', 'ck']);
  });

  it('marks magic e as quiet and lengthens the vowel', () => {
    expect(getSoundParts('cake')).toEqual([
      { text: 'c', phoneme: 'k' },
      { text: 'a', phoneme: 'eɪ' },
      { text: 'k', phoneme: 'k' },
      { text: 'e', phoneme: undefined, silent: true },
    ]);
  });

  it('groups Hebrew diacritics with their base letters', () => {
    expect(getSoundParts('שָׁלוֹם!').map((part) => part.text)).toEqual(['שָׁ', 'ל', 'וֹ', 'ם']);
  });

  it('preserves Hebrew diacritics when cleaning punctuation', () => {
    expect(cleanReadableWord('״כֶּלֶב!״')).toBe('כֶּלֶב');
  });

  it('detects the locale from English or Hebrew text', () => {
    expect(detectReadingLanguage('dog')).toBe('en');
    expect(readingLocale('dog')).toBe('en-US');
    expect(detectReadingLanguage('כֶּלֶב')).toBe('he');
    expect(readingLocale('כֶּלֶב')).toBe('he-IL');
  });
});
