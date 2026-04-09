/**
 * Story library service — persists adventure stories in localStorage
 * with optional Cosmos DB sync for cross-device access.
 *
 * Writes are synchronous (localStorage) with fire-and-forget Cosmos upserts.
 * Reads merge Cosmos + localStorage when authenticated for cross-device sync.
 */

import type { StoryContext } from './storyService';
import type { StickerRegistryEntry } from './stickerService';
import {
  isCosmosConfigured,
  upsertDocument,
  deleteDocument as cosmosDeleteDoc,
  queryDocuments,
} from './cosmosService';

// ---------------------------------------------------------------------------
// Constants & migration tracking
// ---------------------------------------------------------------------------

const GLOBAL_KEY = 'wizbit:story-library';
const userKey = (uid: string) => `wizbit:stories:${uid}`;
const migratedUids = new Set<string>();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SavedChapter {
  number: number;
  title: string;
  text: string;
  choiceMade: string;
}

export interface SavedStory {
  id: string;
  prompt: string;
  readingLevel: string;
  levelEmoji: string;
  chapters: SavedChapter[];
  /** Generation context needed to resume the story. */
  storyContext: StoryContext;
  /** Sticker registry for cross-chapter visual consistency. */
  stickerRegistry?: StickerRegistryEntry[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Cosmos DB document shape
// ---------------------------------------------------------------------------

interface StoryDoc extends SavedStory {
  uid: string;
  type: 'story';
}

function toCosmosDoc(story: SavedStory, uid: string): Record<string, unknown> {
  return { ...story, uid, type: 'story' } as unknown as Record<string, unknown>;
}

function fromCosmosDoc(doc: StoryDoc): SavedStory {
  // Strip Cosmos metadata and our own discriminator fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { uid: _u, type: _t, ...rest } = doc;
  const story = rest as Record<string, unknown>;
  // Remove Cosmos system properties if present
  for (const k of ['_rid', '_self', '_etag', '_attachments', '_ts']) delete story[k];
  return story as unknown as SavedStory;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function resolveKey(uid?: string): string {
  return uid ? userKey(uid) : GLOBAL_KEY;
}

function migrate(stories: SavedStory[]): SavedStory[] {
  return stories.map((s) => ({
    ...s,
    completed: s.completed ?? true,
    storyContext: s.storyContext ?? { prompt: s.prompt, readingLevel: s.readingLevel, chapters: [] },
    updatedAt: s.updatedAt ?? s.createdAt,
  }));
}

function loadAllLocal(uid?: string): SavedStory[] {
  try {
    const raw = localStorage.getItem(resolveKey(uid));
    if (!raw) return [];
    return migrate(JSON.parse(raw) as SavedStory[]);
  } catch {
    return [];
  }
}

function saveAllLocal(stories: SavedStory[], uid?: string): void {
  try {
    localStorage.setItem(resolveKey(uid), JSON.stringify(stories));
  } catch { /* quota exceeded — silently fail */ }
}

/** Move stories from the global key into the user-scoped key (once per uid). */
function migrateGlobalToUser(uid: string): void {
  if (migratedUids.has(uid)) return;
  migratedUids.add(uid);
  try {
    const globalRaw = localStorage.getItem(GLOBAL_KEY);
    if (!globalRaw) return;
    const globalStories = migrate(JSON.parse(globalRaw) as SavedStory[]);
    if (globalStories.length === 0) return;
    const userStories = loadAllLocal(uid);
    const existingIds = new Set(userStories.map((s) => s.id));
    const toMove = globalStories.filter((s) => !existingIds.has(s.id));
    if (toMove.length > 0) saveAllLocal([...userStories, ...toMove], uid);
    localStorage.removeItem(GLOBAL_KEY);
  } catch { /* safe to ignore */ }
}

function sortByDate(stories: SavedStory[]): SavedStory[] {
  return [...stories].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function mergeStoryLists(local: SavedStory[], remote: SavedStory[]): SavedStory[] {
  const map = new Map<string, SavedStory>();
  for (const s of local) map.set(s.id, s);
  for (const s of remote) {
    const existing = map.get(s.id);
    if (!existing || new Date(s.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Public API — reads (async for Cosmos merge)
// ---------------------------------------------------------------------------

/** Load all stories, merging Cosmos + localStorage when authenticated. */
export async function loadStories(uid?: string): Promise<SavedStory[]> {
  if (uid) migrateGlobalToUser(uid);
  const local = loadAllLocal(uid);

  if (!uid || !isCosmosConfigured) return sortByDate(local);

  try {
    const docs = await queryDocuments<StoryDoc>(
      `SELECT * FROM c WHERE c.uid = @uid AND c.type = "story"
       ORDER BY c.updatedAt DESC OFFSET 0 LIMIT 200`,
      [{ name: '@uid', value: uid }],
      uid,
    );
    const remote = docs.map(fromCosmosDoc);
    const merged = mergeStoryLists(local, remote);

    // Update local cache with merged result
    saveAllLocal(merged, uid);

    // Upload any local-only stories to Cosmos (handles initial migration)
    const remoteIds = new Set(remote.map((s) => s.id));
    const localOnly = local.filter((s) => !remoteIds.has(s.id));
    if (localOnly.length > 0) {
      await Promise.allSettled(localOnly.map((s) => upsertDocument(toCosmosDoc(s, uid))));
    }

    return sortByDate(merged);
  } catch {
    return sortByDate(local);
  }
}

// ---------------------------------------------------------------------------
// Public API — writes (sync localStorage + fire-and-forget Cosmos)
// ---------------------------------------------------------------------------

/** Create a new story entry. Returns the saved story with its generated ID. */
export function createStory(
  story: Omit<SavedStory, 'id' | 'createdAt' | 'updatedAt'>,
  uid?: string,
): SavedStory {
  if (uid) migrateGlobalToUser(uid);
  const now = new Date().toISOString();
  const saved: SavedStory = {
    ...story,
    id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  const all = loadAllLocal(uid);
  all.push(saved);
  saveAllLocal(all, uid);

  if (uid && isCosmosConfigured) {
    upsertDocument(toCosmosDoc(saved, uid)).catch(() => {});
  }
  return saved;
}

/** Update an existing story by ID. Only provided fields are merged. */
export function updateStory(
  id: string,
  updates: Partial<Pick<SavedStory, 'chapters' | 'storyContext' | 'completed' | 'stickerRegistry'>>,
  uid?: string,
): void {
  const all = loadAllLocal(uid);
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  saveAllLocal(all, uid);

  if (uid && isCosmosConfigured) {
    upsertDocument(toCosmosDoc(all[idx], uid)).catch(() => {});
  }
}

/** Delete a story by id. */
export function deleteStory(id: string, uid?: string): void {
  const all = loadAllLocal(uid).filter((s) => s.id !== id);
  saveAllLocal(all, uid);

  if (uid && isCosmosConfigured) {
    cosmosDeleteDoc(id, uid).catch(() => {});
  }
}

/** Get a single story by ID (localStorage only). */
export function getStory(id: string, uid?: string): SavedStory | undefined {
  return loadAllLocal(uid).find((s) => s.id === id);
}

/** Sync convenience — returns localStorage stories without Cosmos merge. */
export function getStories(): SavedStory[] {
  return sortByDate(loadAllLocal());
}

// Keep old name as alias for backward compat during migration
export const saveStory = createStory;

// ---------------------------------------------------------------------------
// Story stats for trophy evaluation
// ---------------------------------------------------------------------------

export interface StoryStats {
  /** Total stories created (in-progress + completed). */
  storiesCreated: number;
  /** Total stories that reached their ending. */
  storiesCompleted: number;
  /** Unique reading level grades used across all stories. */
  readingLevelsUsed: string[];
  /** Chapter count of the longest completed story. */
  longestAdventure: number;
}

export function getStoryStats(uid?: string): StoryStats {
  const all = loadAllLocal(uid);
  const completed = all.filter((s) => s.completed);
  const levelsUsed = [...new Set(all.map((s) => s.readingLevel))];
  const longestAdventure = completed.reduce(
    (max, s) => Math.max(max, s.chapters.length),
    0,
  );
  return {
    storiesCreated: all.length,
    storiesCompleted: completed.length,
    readingLevelsUsed: levelsUsed,
    longestAdventure,
  };
}
