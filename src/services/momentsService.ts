/**
 * Analyses reading text with Azure OpenAI GPT-4o-mini (via the Wizbit
 * backend proxy) to identify "key moments" — points in the text where we
 * can show a relevant image or play a short piece of music to make
 * reading immersive.
 *
 * Includes a simple in-memory cache to avoid duplicate requests.
 */

import { z } from 'zod';
import { apiPost, QuotaExceededError } from './apiClient';

/* (Azure OpenAI is now invoked via the backend proxy — see apiClient.) */

export interface KeyMoment {
  wordIndex: number;
  triggerWord: string;
  /** Word index where this moment should fade out. Defaults to wordIndex if absent. */
  fadeWordIndex?: number;
  fadeWord?: string;
  type: 'image' | 'music' | 'both';
  imageQuery?: string;
  /** Short phrase describing a sticker to generate (e.g. "a cute penguin swimming"). */
  stickerPrompt?: string;
  /** A single emoji that best represents this moment (fallback visual). */
  stickerEmoji?: string;
  /** Consistent label for reuse across chapters (e.g. "brave knight", "enchanted forest"). */
  stickerLabel?: string;
  musicCategory?: string;
  /** Short contextual sound effect to play at this moment. */
  soundEffect?: string;
  caption: string;
}

const KeyMomentSchema = z.object({
  wordIndex: z.number().int().nonnegative(),
  triggerWord: z.string(),
  fadeWordIndex: z.number().int().nonnegative().optional(),
  fadeWord: z.string().optional(),
  type: z.enum(['image', 'music', 'both']),
  imageQuery: z.string().optional(),
  stickerPrompt: z.string().optional(),
  stickerEmoji: z.string().optional(),
  stickerLabel: z.string().optional(),
  musicCategory: z.string().optional(),
  soundEffect: z.string().optional(),
  caption: z.string(),
});

const SYSTEM_PROMPT = `You are a learning assistant for children ages 6-12. Analyse the given text and identify 4-8 key moments where showing a visual sticker, playing background music, or triggering a contextual sound effect would make reading more immersive and engaging.

Each moment spans a range of words: it appears at the "start" word and fades at the "fade" word. Pick a range that covers the phrase or scene the moment illustrates (typically 3-10 words).

For each moment return a JSON object with:
- wordIndex: 0-based index of the START word where the moment appears
- triggerWord: the actual start word
- fadeWordIndex: 0-based index of the FADE word where the moment disappears (must be >= wordIndex)
- fadeWord: the actual fade word
- type: "image", "music", or "both"
- imageQuery: a Wikipedia article title for finding a reference image (use underscores for spaces, e.g. "Napoleon", "Amazon_rainforest"). Only if type includes image.
- stickerPrompt: a short phrase describing a cute cartoon sticker to show (e.g. "a happy orange cat sitting", "bright yellow sun with sunglasses", "a rocket blasting off"). Keep it simple, child-friendly, and visual. Only if type includes image.
- stickerEmoji: a single emoji that best represents this moment (always include this)
- stickerLabel: a short consistent name for the character, place, or object this sticker depicts (e.g. "brave knight", "enchanted forest", "golden crown"). Use the SAME label when the same entity appears again — this ensures visual consistency across chapters.
- musicCategory: one of "nature", "dramatic", "celebration", "peaceful", "mysterious", "adventure", "ocean", "space". Only if type includes music.
- soundEffect: (optional) a short sound effect that matches what is happening in the text at this word. Pick from: "falling", "splash", "honk", "thunder", "wind", "rain", "bark", "roar", "bell", "whistle", "bird", "whoosh", "knock", "pop", "buzz", "boom", "gallop", "wave", "cheer", "fire", "ding", "creak", "snap", "engine", "scream". Only include when the text clearly describes an action or scene that has a recognisable sound.
- caption: a fun, kid-friendly one-sentence fact (max 15 words)

Return ONLY a valid JSON array. No markdown fences, no explanation.`;

const momentsCache = new Map<string, KeyMoment[]>();

export async function analyzeTextForMoments(words: string[], knownStickerLabels?: string[]): Promise<KeyMoment[]> {
  const text = words.join(' ');
  const cached = momentsCache.get(text);
  if (cached) return cached;

  const indexed = words.map((w, i) => `${i}:${w}`);

  let userContent = `Text: "${text}"\n\nWords (0-indexed): ${JSON.stringify(indexed)}`;
  if (knownStickerLabels?.length) {
    userContent += `\n\nKNOWN STICKER LABELS (reuse these exact labels when the same character/place/object appears): ${knownStickerLabels.join(', ')}`;
  }

  try {
    const data = await apiPost<unknown, { content: string }>('/openai/chat', {
      purpose: 'moments',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = data.content ?? '';
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const moments = JSON.parse(jsonStr) as KeyMoment[];

    const valid = z.array(KeyMomentSchema).safeParse(moments);
    const filtered = (valid.success ? valid.data : [])
      .map((m) => ({
        ...m,
        // Clamp fadeWordIndex: must be >= wordIndex and within bounds
        fadeWordIndex: Math.min(
          Math.max(m.fadeWordIndex ?? m.wordIndex, m.wordIndex),
          words.length - 1,
        ),
      }))
      .filter((m) => m.wordIndex >= 0 && m.wordIndex < words.length);

    momentsCache.set(text, filtered);
    return filtered;
  } catch (err) {
    // Quota errors must propagate so the UI can show the paywall;
    // any other error is a best-effort silent failure.
    if (err instanceof QuotaExceededError) throw err;
    return [];
  }
}
