/**
 * Azure Translator service — translates words to Hebrew.
 */

const TRANSLATOR_KEY = import.meta.env.VITE_AZURE_TRANSLATOR_KEY as string;
const TRANSLATOR_REGION = import.meta.env.VITE_AZURE_TRANSLATOR_REGION as string;

const TRANSLATE_URL =
  'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=he';

export interface TranslationResult {
  hebrew: string;
}

/**
 * Translate an English word or phrase to Hebrew via Azure Translator.
 */
export async function translateToHebrew(text: string): Promise<TranslationResult> {
  if (!TRANSLATOR_KEY || !TRANSLATOR_REGION) {
    throw new Error(
      'Azure Translator credentials are not configured. ' +
        'Set VITE_AZURE_TRANSLATOR_KEY and VITE_AZURE_TRANSLATOR_REGION in your .env file.',
    );
  }

  const res = await fetch(TRANSLATE_URL, {
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
  const hebrew: string = data?.[0]?.translations?.[0]?.text ?? '';
  return { hebrew };
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
 * Translate a single word to Hebrew using the surrounding text for context.
 *
 * Sends the full text to Azure Translator with `includeAlignment=true`,
 * then uses word-alignment data to extract only the Hebrew fragment that
 * corresponds to the target word. Falls back to a standalone translation
 * if alignment is unavailable or parsing fails.
 */
export async function translateWordInContext(
  word: string,
  fullText: string,
): Promise<TranslationResult> {
  const clean = word.replace(/[^a-zA-Z']/g, '');

  if (!TRANSLATOR_KEY || !TRANSLATOR_REGION) {
    return translateToHebrew(clean);
  }

  const srcStart = fullText.indexOf(word);
  if (srcStart === -1) return translateToHebrew(clean);
  const srcEnd = srcStart + word.length - 1;

  try {
    const res = await fetch(TRANSLATE_URL + '&includeAlignment=true', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ Text: fullText }]),
    });

    if (!res.ok) return translateToHebrew(clean);

    const data = await res.json();
    const translation = data?.[0]?.translations?.[0];
    const hebrewFull: string = translation?.text ?? '';
    const alignment: string = translation?.alignment?.proj ?? '';

    if (!alignment) return translateToHebrew(clean);

    const range = resolveAlignment(alignment, srcStart, srcEnd);
    if (range) {
      const extracted = hebrewFull
        .substring(range.start, range.end + 1)
        .replace(/[.,!?;:"""''()]/g, '')
        .trim();
      if (extracted) return { hebrew: extracted };
    }

    return translateToHebrew(clean);
  } catch {
    return translateToHebrew(clean);
  }
}
