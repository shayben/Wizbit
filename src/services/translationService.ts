/**
 * Azure Translator service — translates words to a configurable target language.
 */

const TRANSLATOR_KEY = import.meta.env.VITE_AZURE_TRANSLATOR_KEY as string;
const TRANSLATOR_REGION = import.meta.env.VITE_AZURE_TRANSLATOR_REGION as string;

const TRANSLATE_BASE =
  'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0';

export interface SupportedLanguage {
  code: string;
  label: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'he', label: 'Hebrew', flag: '🇮🇱', dir: 'rtl' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸', dir: 'ltr' },
  { code: 'fr', label: 'French', flag: '🇫🇷', dir: 'ltr' },
  { code: 'de', label: 'German', flag: '🇩🇪', dir: 'ltr' },
  { code: 'zh-Hans', label: 'Chinese', flag: '🇨🇳', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦', dir: 'rtl' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵', dir: 'ltr' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷', dir: 'ltr' },
];

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0]; // Hebrew

export interface TranslationResult {
  translation: string;
}

/**
 * Translate an English word or phrase to the given target language.
 */
export async function translateWord(text: string, langCode = 'he'): Promise<TranslationResult> {
  if (!TRANSLATOR_KEY || !TRANSLATOR_REGION) {
    throw new Error(
      'Azure Translator credentials are not configured. ' +
        'Set VITE_AZURE_TRANSLATOR_KEY and VITE_AZURE_TRANSLATOR_REGION in your .env file.',
    );
  }

  const url = `${TRANSLATE_BASE}&to=${langCode}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
      'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text }]),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Translator API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const translation: string = data?.[0]?.translations?.[0]?.text ?? '';
  return { translation };
}

/**
 * Parse the alignment projection string to find the target character range
 * that corresponds to a source character range.
 *
 * Alignment format: "0:2-0:3 4:6-5:8 …"
 * Each pair is "srcStart:srcEnd-tgtStart:tgtEnd" (inclusive char indices).
 */
function resolveAlignment(
  proj: string,
  srcStart: number,
  srcEnd: number,
): { start: number; end: number } | null {
  let minTgt = Infinity;
  let maxTgt = -1;

  for (const pair of proj.split(' ')) {
    const halves = pair.split('-');
    if (halves.length !== 2) continue;
    const src = halves[0].split(':').map(Number);
    const tgt = halves[1].split(':').map(Number);
    if (src.length !== 2 || tgt.length !== 2) continue;

    if (src[1] >= srcStart && src[0] <= srcEnd) {
      minTgt = Math.min(minTgt, tgt[0]);
      maxTgt = Math.max(maxTgt, tgt[1]);
    }
  }

  return maxTgt >= 0 ? { start: minTgt, end: maxTgt } : null;
}

/**
 * Translate a single word using the surrounding text for context.
 *
 * Sends the full text to Azure Translator with `includeAlignment=true`,
 * then uses word-alignment data to extract only the target-language fragment
 * that corresponds to the target word. Falls back to a standalone translation
 * if alignment is unavailable or parsing fails.
 */
export async function translateWordInContext(
  word: string,
  fullText: string,
  langCode = 'he',
): Promise<TranslationResult> {
  const clean = word.replace(/[^a-zA-Z']/g, '');

  if (!TRANSLATOR_KEY || !TRANSLATOR_REGION) {
    return translateWord(clean, langCode);
  }

  const srcStart = fullText.indexOf(word);
  if (srcStart === -1) return translateWord(clean, langCode);
  const srcEnd = srcStart + word.length - 1;

  try {
    const url = `${TRANSLATE_BASE}&to=${langCode}&includeAlignment=true`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ Text: fullText }]),
    });

    if (!res.ok) return translateWord(clean, langCode);

    const data = await res.json();
    const translation = data?.[0]?.translations?.[0];
    const translatedFull: string = translation?.text ?? '';
    const alignment: string = translation?.alignment?.proj ?? '';

    if (!alignment) return translateWord(clean, langCode);

    const range = resolveAlignment(alignment, srcStart, srcEnd);
    if (range) {
      const extracted = translatedFull
        .substring(range.start, range.end + 1)
        .replace(/[.,!?;:"""''()]/g, '')
        .trim();
      if (extracted) return { translation: extracted };
    }

    return translateWord(clean, langCode);
  } catch {
    return translateWord(clean, langCode);
  }
}
