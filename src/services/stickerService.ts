/**
 * Hybrid sticker image service.
 *
 * Resolution order:
 *  1. Pre-bundled transparent PNG from /public/stickers/ (instant, zero cost)
 *  2. Azure OpenAI DALL-E generated sticker (transparent PNG, ~$0.02-0.04 each)
 *     — premium-only; gated by the backend `/api/openai/image` endpoint.
 *  3. Wikipedia thumbnail styled as a sticker (free, good coverage)
 *  4. Emoji fallback (always available, animated)
 */

import { apiPost, QuotaExceededError } from './apiClient';

export type StickerSource = 'bundled' | 'generated' | 'wikipedia' | 'emoji';

export interface StickerResult {
  source: StickerSource;
  /** Image URL (transparent PNG, Wikipedia thumbnail, or data URI). */
  url?: string;
  /** Emoji character used as a sticker when no image is available. */
  emoji?: string;
}

// ---------------------------------------------------------------------------
// Story sticker registry — enables cross-chapter sticker reuse
// ---------------------------------------------------------------------------

export interface StickerRegistryEntry {
  label: string;
  url?: string;
  emoji?: string;
  source: StickerSource;
  stickerPrompt?: string;
}

/** Map from normalised stickerLabel → resolved sticker data. */
export type StickerRegistry = Map<string, StickerRegistryEntry>;

/** Serialize a StickerRegistry for JSON storage (e.g. in SavedStory). */
export function serializeRegistry(registry: StickerRegistry): StickerRegistryEntry[] {
  return Array.from(registry.values());
}

/** Deserialize a StickerRegistry from a stored array. */
export function deserializeRegistry(entries: StickerRegistryEntry[]): StickerRegistry {
  const map: StickerRegistry = new Map();
  for (const e of entries) {
    map.set(e.label.toLowerCase().trim(), e);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Pre-bundled sticker catalog
// ---------------------------------------------------------------------------

/**
 * Maps lowercase imageQuery keywords to filenames in /public/stickers/.
 * Add entries here as transparent PNG stickers are designed.
 */
const STICKER_CATALOG: Record<string, string> = {
  // Example: 'cat': 'cat.png',
  // Populate as sticker assets are added to /public/stickers/
};

async function tryBundledSticker(imageQuery: string): Promise<string | undefined> {
  const key = imageQuery.toLowerCase().replace(/_/g, ' ');
  const filename = STICKER_CATALOG[key];
  if (!filename) return undefined;
  const url = `/stickers/${filename}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Azure OpenAI DALL-E generation
// ---------------------------------------------------------------------------

// DALL-E availability is gated server-side by the proxy + plan tier.

async function generateStickerImage(prompt: string): Promise<string | undefined> {
  try {
    const data = await apiPost<unknown, { url?: string; b64_json?: string }>(
      '/openai/image',
      { prompt, size: '1024x1024', quality: 'low' },
    );
    if (data.url) return data.url;
    if (data.b64_json) return `data:image/png;base64,${data.b64_json}`;
    return undefined;
  } catch (err) {
    // Quota exceeded → fall through silently to Wikipedia / emoji fallback;
    // the rest of the UI will still surface the paywall via the global event.
    if (err instanceof QuotaExceededError) return undefined;
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Wikipedia fallback
// ---------------------------------------------------------------------------

async function fetchWikipediaImage(query: string): Promise<string | undefined> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    return data?.thumbnail?.source ?? data?.originalimage?.source;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

const stickerCache = new Map<string, StickerResult>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a sticker for a moment. Tries each source in priority order.
 *
 * @param imageQuery   Wikipedia article title / catalog keyword.
 * @param stickerPrompt  Descriptive prompt for AI image generation.
 * @param stickerEmoji   Fallback emoji from the AI analysis.
 */
export async function fetchSticker(
  imageQuery?: string,
  stickerPrompt?: string,
  stickerEmoji?: string,
): Promise<StickerResult> {
  const cacheKey = `${imageQuery ?? ''}|${stickerPrompt ?? ''}`;
  const cached = stickerCache.get(cacheKey);
  if (cached) return cached;

  const store = (result: StickerResult): StickerResult => {
    stickerCache.set(cacheKey, result);
    return result;
  };

  // 1. Pre-bundled sticker
  if (imageQuery) {
    const bundled = await tryBundledSticker(imageQuery);
    if (bundled) return store({ source: 'bundled', url: bundled });
  }

  // 2. AI-generated sticker (transparent PNG)
  if (stickerPrompt) {
    const generated = await generateStickerImage(stickerPrompt);
    if (generated) return store({ source: 'generated', url: generated });
  }

  // 3. Wikipedia image
  if (imageQuery) {
    const wikiUrl = await fetchWikipediaImage(imageQuery);
    if (wikiUrl) return store({ source: 'wikipedia', url: wikiUrl });
  }

  // 4. Emoji fallback
  if (stickerEmoji) return store({ source: 'emoji', emoji: stickerEmoji });

  return store({ source: 'emoji' });
}
