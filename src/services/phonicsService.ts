export type ReadingLanguage = 'en' | 'he';

export interface SoundPart {
  text: string;
  /** IPA pronunciation for English Azure voices. Omitted for Hebrew text. */
  phoneme?: string;
  silent?: boolean;
}

const HEBREW = /[\u0590-\u05ff]/u;
const HEBREW_LETTER = /[\u05d0-\u05ea]/u;
const HEBREW_MARK = /[\u0591-\u05bd\u05bf-\u05c2\u05c4\u05c5\u05c7]/u;

const ENGLISH_SOUNDS: Record<string, string> = {
  a: 'æ', b: 'b', c: 'k', d: 'd', e: 'ɛ', f: 'f', g: 'g', h: 'h',
  i: 'ɪ', j: 'dʒ', k: 'k', l: 'l', m: 'm', n: 'n', o: 'ɑ', p: 'p',
  q: 'k', r: 'ɹ', s: 's', t: 't', u: 'ʌ', v: 'v', w: 'w', x: 'ks',
  y: 'j', z: 'z',
  ch: 'tʃ', ck: 'k', ng: 'ŋ', ph: 'f', qu: 'kw', sh: 'ʃ', th: 'θ',
  wh: 'w',
};

const PHONOGRAMS = ['ch', 'ck', 'ng', 'ph', 'qu', 'sh', 'th', 'wh'];
const LONG_VOWELS: Record<string, string> = {
  a: 'eɪ', e: 'i', i: 'aɪ', o: 'oʊ', u: 'ju',
};

/** Remove surrounding punctuation without dropping Hebrew vowel and cantillation marks. */
export function cleanReadableWord(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{Script=Latin}\p{Script=Hebrew}\p{M}']/gu, '');
}

export function detectReadingLanguage(raw: string): ReadingLanguage {
  return HEBREW.test(raw) ? 'he' : 'en';
}

export function readingLocale(raw: string): 'en-US' | 'he-IL' {
  return detectReadingLanguage(raw) === 'he' ? 'he-IL' : 'en-US';
}

function splitHebrewSounds(word: string): SoundPart[] {
  const parts: SoundPart[] = [];

  for (const character of Array.from(word)) {
    if (HEBREW_MARK.test(character) && parts.length > 0) {
      parts[parts.length - 1].text += character;
    } else if (HEBREW_LETTER.test(character)) {
      parts.push({ text: character });
    }
  }

  return parts;
}

function splitEnglishSounds(word: string): SoundPart[] {
  const lower = word.toLowerCase();
  const parts: SoundPart[] = [];
  let index = 0;

  while (index < lower.length) {
    const pair = lower.slice(index, index + 2);
    const text = PHONOGRAMS.includes(pair) ? word.slice(index, index + 2) : word[index];
    const key = text.toLowerCase();
    let phoneme = ENGLISH_SOUNDS[key];

    if (key === 'c' && /[eiy]/.test(lower[index + 1] ?? '')) phoneme = 's';
    if (key === 'g' && /[eiy]/.test(lower[index + 1] ?? '')) phoneme = 'dʒ';

    parts.push({ text, phoneme });
    index += text.length;
  }

  // In a simple consonant-vowel-consonant-e word, the final e is quiet and
  // makes the preceding vowel long (for example, "cake" or "hope").
  if (lower.length >= 4 && lower.endsWith('e') && parts.at(-1)?.text.toLowerCase() === 'e') {
    const vowelIndex = parts.length - 3;
    const vowel = parts[vowelIndex]?.text.toLowerCase();
    if (vowel && LONG_VOWELS[vowel]) {
      parts[vowelIndex].phoneme = LONG_VOWELS[vowel];
      parts[parts.length - 1].silent = true;
      parts[parts.length - 1].phoneme = undefined;
    }
  }

  return parts;
}

/** Split a first-grade word into tappable letter sounds, preserving nikud. */
export function getSoundParts(raw: string): SoundPart[] {
  const word = cleanReadableWord(raw);
  if (!word) return [];

  return detectReadingLanguage(word) === 'he'
    ? splitHebrewSounds(word)
    : splitEnglishSounds(word);
}
