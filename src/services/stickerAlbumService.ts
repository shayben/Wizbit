/**
 * Sticker album service — persists collected stickers with optional
 * Cosmos DB sync for cross-device access.
 *
 * Writes are synchronous (localStorage) with fire-and-forget Cosmos upserts.
 * Reads merge Cosmos + localStorage when authenticated.
 */

import type { StickerSource } from './stickerService';
import {
  isCosmosConfigured,
  upsertDocument,
  queryDocuments,
} from './cosmosService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOBAL_KEY = 'wizbit:sticker-album';
const userKey = (uid: string) => `wizbit:stickers:${uid}`;
const migratedUids = new Set<string>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollectedSticker {
  id: string;
  label: string;
  stickerUrl?: string;
  stickerEmoji?: string;
  stickerSource: StickerSource;
  caption: string;
  storyTitle?: string;
  collectedAt: string;
}

interface StickerDoc extends CollectedSticker {
  uid: string;
  type: 'sticker';
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function resolveKey(uid?: string): string {
  return uid ? userKey(uid) : GLOBAL_KEY;
}

function loadAllLocal(uid?: string): CollectedSticker[] {
  try {
    const raw = localStorage.getItem(resolveKey(uid));
    return raw ? (JSON.parse(raw) as CollectedSticker[]) : [];
  } catch {
    return [];
  }
}

function saveAllLocal(stickers: CollectedSticker[], uid?: string): void {
  try {
    localStorage.setItem(resolveKey(uid), JSON.stringify(stickers));
  } catch { /* quota exceeded — silently fail */ }
}

/** Migrate stickers from the global key to user-scoped key (once per uid). */
function migrateGlobalToUser(uid: string): void {
  if (migratedUids.has(uid)) return;
  migratedUids.add(uid);
  try {
    const globalRaw = localStorage.getItem(GLOBAL_KEY);
    if (!globalRaw) return;
    const globalStickers = JSON.parse(globalRaw) as CollectedSticker[];
    if (globalStickers.length === 0) return;
    const userStickers = loadAllLocal(uid);
    const existingIds = new Set(userStickers.map((s) => s.id));
    const toMove = globalStickers.filter((s) => !existingIds.has(s.id));
    if (toMove.length > 0) saveAllLocal([...userStickers, ...toMove], uid);
    localStorage.removeItem(GLOBAL_KEY);
  } catch { /* safe to ignore */ }
}

// ---------------------------------------------------------------------------
// Cosmos helpers
// ---------------------------------------------------------------------------

function toCosmosDoc(sticker: CollectedSticker, uid: string): Record<string, unknown> {
  return { ...sticker, uid, type: 'sticker' } as unknown as Record<string, unknown>;
}

function fromCosmosDoc(doc: StickerDoc): CollectedSticker {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { uid: _u, type: _t, ...rest } = doc;
  const s = rest as Record<string, unknown>;
  for (const k of ['_rid', '_self', '_etag', '_attachments', '_ts']) delete s[k];
  return s as unknown as CollectedSticker;
}

function mergeStickerLists(local: CollectedSticker[], remote: CollectedSticker[]): CollectedSticker[] {
  const map = new Map<string, CollectedSticker>();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) {
    const existing = map.get(s.id);
    if (!existing || new Date(s.collectedAt).getTime() > new Date(existing.collectedAt).getTime()) {
      map.set(s.id, s);
    }
  }
  // Also deduplicate by normalised label (keep the newest with best image)
  const byLabel = new Map<string, CollectedSticker>();
  for (const s of map.values()) {
    const key = s.label.toLowerCase().trim();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, s);
    } else {
      // Prefer the one with an image, then newest
      const existingHasImage = Boolean(existing.stickerUrl);
      const newHasImage = Boolean(s.stickerUrl);
      if ((!existingHasImage && newHasImage) ||
          new Date(s.collectedAt).getTime() > new Date(existing.collectedAt).getTime()) {
        byLabel.set(key, { ...s, stickerUrl: s.stickerUrl || existing.stickerUrl });
      }
    }
  }
  return Array.from(byLabel.values());
}

// ---------------------------------------------------------------------------
// Public API — reads
// ---------------------------------------------------------------------------

/** Load all collected stickers, merging Cosmos + localStorage when authenticated. */
export async function loadCollectedStickers(uid?: string): Promise<CollectedSticker[]> {
  if (uid) migrateGlobalToUser(uid);
  const local = loadAllLocal(uid);

  if (!uid || !isCosmosConfigured) {
    return local.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  }

  try {
    const docs = await queryDocuments<StickerDoc>(
      `SELECT * FROM c WHERE c.uid = @uid AND c.type = "sticker"
       ORDER BY c.collectedAt DESC OFFSET 0 LIMIT 500`,
      [{ name: '@uid', value: uid }],
      uid,
    );
    const remote = docs.map(fromCosmosDoc);
    const merged = mergeStickerLists(local, remote);

    saveAllLocal(merged, uid);

    // Upload local-only stickers to Cosmos
    const remoteIds = new Set(remote.map((s) => s.id));
    const localOnly = local.filter((s) => !remoteIds.has(s.id));
    if (localOnly.length > 0) {
      await Promise.allSettled(localOnly.map((s) => upsertDocument(toCosmosDoc(s, uid))));
    }

    return merged.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  } catch {
    return local.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
  }
}

// ---------------------------------------------------------------------------
// Public API — writes
// ---------------------------------------------------------------------------

/**
 * Collect a sticker (deduplicated by label).
 * If the label already exists, upgrades the image if the existing one was emoji-only.
 */
export function collectSticker(
  sticker: Omit<CollectedSticker, 'id' | 'collectedAt'>,
  uid?: string,
): CollectedSticker {
  if (uid) migrateGlobalToUser(uid);
  const all = loadAllLocal(uid);
  const normalizedLabel = sticker.label.toLowerCase().trim();
  const existing = all.find(
    (s) => s.label.toLowerCase().trim() === normalizedLabel,
  );

  if (existing) {
    if (!existing.stickerUrl && sticker.stickerUrl) {
      existing.stickerUrl = sticker.stickerUrl;
      existing.stickerSource = sticker.stickerSource;
    }
    existing.collectedAt = new Date().toISOString();
    saveAllLocal(all, uid);
    if (uid && isCosmosConfigured) {
      upsertDocument(toCosmosDoc(existing, uid)).catch(() => {});
    }
    return existing;
  }

  const collected: CollectedSticker = {
    ...sticker,
    id: `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    collectedAt: new Date().toISOString(),
  };
  all.push(collected);
  saveAllLocal(all, uid);

  if (uid && isCosmosConfigured) {
    upsertDocument(toCosmosDoc(collected, uid)).catch(() => {});
  }
  return collected;
}

/** Get count of unique collected stickers (localStorage only). */
export function getStickerCount(uid?: string): number {
  return loadAllLocal(uid).length;
}
