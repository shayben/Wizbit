/**
 * Translation service — calls the Wizbit backend proxy for both Azure
 * Translator (per-word in-context lookups) and Azure OpenAI (whole-text
 * batch translation). Public exports are unchanged.
 */

import { z } from 'zod';
import { apiPost, QuotaExceededError } from './apiClient';

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
  try {
    const data = await apiPost<unknown, Array<{ translations?: Array<{ text?: string }> }>>(
      '/translate',
      { text, to: langCode },
    );
    const translation: string = data?.[0]?.translations?.[0]?.text ?? '';
    return { translation };
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    return { translation: '' };
  }
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

  const srcStart = fullText.indexOf(word);
  if (srcStart === -1) return translateWord(clean, langCode);
  const srcEnd = srcStart + word.length - 1;

  try {
    const data = await apiPost<
      unknown,
      Array<{ translations?: Array<{ text?: string; alignment?: { proj?: string } }> }>
    >('/translate', { text: fullText, to: langCode, includeAlignment: true });

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
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    return translateWord(clean, langCode);
  }
}

// ── Batch translation via Azure OpenAI ──

export type WordTranslationMap = Map<string, string>;

/**
 * Translate all unique words in a text at once using Azure OpenAI (via the
 * backend proxy). Returns a Map from lowercase English word → translated word.
 *
 * One API call replaces N per-word calls. Falls back to empty map on failure
 * EXCEPT for quota errors which propagate to the UI.
 */
export async function batchTranslateText(
  fullText: string,
  langCode: string,
  langLabel: string,
): Promise<WordTranslationMap> {
  const map: WordTranslationMap = new Map();

  const words = fullText.match(/[a-zA-Z']+/g) ?? [];
  const unique = [...new Set(words.map((w) => w.toLowerCase()))];
  if (unique.length === 0) return map;

  try {
    const data = await apiPost<unknown, { content: string }>('/openai/chat', {
      purpose: 'translate-batch',
      messages: [
        {
          role: 'system',
          content: `You are a translator for a children's reading app. Translate each English word to ${langLabel} (${langCode}), using the surrounding text for context so polysemous words get the right meaning.\n\nReturn ONLY a valid JSON object mapping each English word (lowercase) to its translation. No markdown fences, no explanation.\n\nExample: {"cat": "חתול", "sat": "ישב"}`,
        },
        {
          role: 'user',
          content: `Full text for context:\n"${fullText}"\n\nTranslate these words: ${JSON.stringify(unique)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: Math.min(unique.length * 20, 2000),
    });

    const content = data.content ?? '';
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(jsonStr));
    if (!parsed.success) return map;

    for (const [key, val] of Object.entries(parsed.data)) {
      if (val.trim()) {
        map.set(key.toLowerCase(), val.trim());
      }
    }
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    // Best-effort — return whatever we got
  }

  return map;
}
