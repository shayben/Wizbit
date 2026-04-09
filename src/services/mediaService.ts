/**
 * Fetches and preloads media (images + audio) for key moments.
 *
 * Images come from the Wikipedia REST API (page summary thumbnails).
 * Audio uses a curated category→URL map of public-domain clips.
 */

import type { KeyMoment } from './momentsService';

export interface PreloadedMoment {
  wordIndex: number;
  triggerWord: string;
  caption: string;
  imageUrl?: string;
  audioUrl?: string;
}

/** Category → public-domain audio URL (Wikimedia Commons, CC0/PD). */
const AMBIENT_AUDIO: Record<string, string> = {
  // Add curated URLs here as needed — audio playback is best-effort.
};

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

/**
 * Preload all media for an array of key moments.
 * Returns only moments that have at least one usable asset.
 */
export async function preloadMoments(moments: KeyMoment[]): Promise<PreloadedMoment[]> {
  const results = await Promise.all(
    moments.map(async (m): Promise<PreloadedMoment> => {
      const out: PreloadedMoment = {
        wordIndex: m.wordIndex,
        triggerWord: m.triggerWord,
        caption: m.caption,
      };

      // Image
      if ((m.type === 'image' || m.type === 'both') && m.imageQuery) {
        out.imageUrl = await fetchWikipediaImage(m.imageQuery);
        if (out.imageUrl) {
          const img = new Image();
          img.src = out.imageUrl; // warm the browser cache
        }
      }

      // Audio
      if ((m.type === 'music' || m.type === 'both') && m.musicCategory) {
        const audioSrc = AMBIENT_AUDIO[m.musicCategory];
        if (audioSrc) {
          out.audioUrl = audioSrc;
          try {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = audioSrc;
          } catch { /* best-effort */ }
        }
      }

      return out;
    }),
  );

  return results.filter((m) => m.imageUrl || m.audioUrl);
}
