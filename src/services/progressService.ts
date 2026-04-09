/**
 * Progress service — persists reading history, practice words, and trophies
 * to Azure Cosmos DB (when configured) with a localStorage cache/fallback.
 *
 * Cosmos DB container setup:
 *   Database:      reading-assistant  (or VITE_COSMOS_DATABASE)
 *   Container:     progress           (or VITE_COSMOS_CONTAINER)
 *   Partition key: /uid
 *
 * Document types stored in the single container:
 *   type="meta"         id={uid}_meta
 *   type="session"      id={uid}_{timestamp}
 *   type="practiceWord" id={uid}_pw_{word}
 *   type="trophy"       id={uid}_trophy_{trophyId}
 */

import {
  isCosmosConfigured,
  upsertDocument,
  readDocument,
  deleteDocument,
  queryDocuments,
} from './cosmosService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  date: string;           // ISO date string
  title: string;          // short label (first ~40 chars of text)
  score: number;
  stars: number;
  accuracy: number;       // 0–100
  wordCount: number;
  hardWordCount: number;
  hardWordCorrect: number;
  wordsNeedPractice: string[];
}

export interface PracticeWord {
  word: string;
  failCount: number;
  lastSeen: string;       // ISO date string
}

export interface EarnedTrophy {
  id: string;
  earnedAt: string;       // ISO date string
}

/** Aggregated stats needed by the trophy engine. */
export interface UserProgress {
  sessionCount: number;
  sessionDates: string[];      // one entry per session (ISO date)
  practiceClearedCount: number;
  latestSession: SessionRecord | null;
}

// ---------------------------------------------------------------------------
// Internal Cosmos document shapes
// ---------------------------------------------------------------------------

interface MetaDoc {
  id: string;
  uid: string;
  type: 'meta';
  sessionCount: number;
  sessionDates: string[];
  practiceClearedCount: number;
}

interface SessionDoc extends SessionRecord {
  uid: string;
  type: 'session';
}

interface PracticeWordDoc extends PracticeWord {
  id: string;
  uid: string;
  type: 'practiceWord';
}

interface TrophyDoc {
  id: string;
  uid: string;
  type: 'trophy';
  trophyId: string;
  earnedAt: string;
}

// ---------------------------------------------------------------------------
// Local-storage keys (fallback / offline cache)
// ---------------------------------------------------------------------------

const LS_SESSIONS = (uid: string) => `ra_sessions_${uid}`;
const LS_PRACTICE = (uid: string) => `ra_practice_${uid}`;
const LS_TROPHIES = (uid: string) => `ra_trophies_${uid}`;
const LS_META     = (uid: string) => `ra_meta_${uid}`;

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function sessionTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function metaId(uid: string): string { return `${uid}_meta`; }
function pwId(uid: string, word: string): string { return `${uid}_pw_${word}`; }
function trophyId(uid: string, id: string): string { return `${uid}_trophy_${id}`; }

// ---------------------------------------------------------------------------
// Session saving
// ---------------------------------------------------------------------------

export async function saveSession(
  uid: string,
  sessionId: string,
  text: string,
  score: number,
  stars: number,
  accuracy: number,
  wordCount: number,
  hardWordCount: number,
  hardWordCorrect: number,
  wordsNeedPractice: string[],
): Promise<void> {
  const record: SessionRecord = {
    id: sessionId,
    date: new Date().toISOString(),
    title: sessionTitle(text),
    score,
    stars,
    accuracy,
    wordCount,
    hardWordCount,
    hardWordCorrect,
    wordsNeedPractice,
  };

  // --- localStorage ---
  const stored = lsGet<SessionRecord[]>(LS_SESSIONS(uid)) ?? [];
  stored.unshift(record);
  lsSet(LS_SESSIONS(uid), stored.slice(0, 200));

  const meta = lsGet<{ sessionCount: number; sessionDates: string[]; practiceClearedCount: number }>(LS_META(uid)) ?? {
    sessionCount: 0, sessionDates: [], practiceClearedCount: 0,
  };
  meta.sessionCount += 1;
  meta.sessionDates.push(todayISO());
  lsSet(LS_META(uid), meta);

  // --- Cosmos DB ---
  if (!isCosmosConfigured) return;
  try {
    const sessionDoc: SessionDoc = { ...record, uid, type: 'session' };
    await upsertDocument(sessionDoc as unknown as Record<string, unknown>);

    // Update or create meta document
    const existingMeta = await readDocument<MetaDoc>(metaId(uid), uid);
    const updatedMeta: MetaDoc = {
      id: metaId(uid),
      uid,
      type: 'meta',
      sessionCount: (existingMeta?.sessionCount ?? 0) + 1,
      sessionDates: [...(existingMeta?.sessionDates ?? []), todayISO()],
      practiceClearedCount: existingMeta?.practiceClearedCount ?? 0,
    };
    await upsertDocument(updatedMeta as unknown as Record<string, unknown>);
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Practice words
// ---------------------------------------------------------------------------

export async function updatePracticeWords(
  uid: string,
  wordsNeedPractice: string[],
  wordsNowCorrect: string[],
): Promise<number> {
  let clearedCount = 0;

  // --- localStorage ---
  const stored = lsGet<Record<string, PracticeWord>>(LS_PRACTICE(uid)) ?? {};

  for (const word of wordsNeedPractice) {
    const existing = stored[word];
    stored[word] = {
      word,
      failCount: (existing?.failCount ?? 0) + 1,
      lastSeen: new Date().toISOString(),
    };
  }

  for (const word of wordsNowCorrect) {
    if (stored[word]) {
      delete stored[word];
      clearedCount++;
    }
  }

  lsSet(LS_PRACTICE(uid), stored);

  if (clearedCount > 0) {
    const meta = lsGet<{ sessionCount: number; sessionDates: string[]; practiceClearedCount: number }>(LS_META(uid)) ?? {
      sessionCount: 0, sessionDates: [], practiceClearedCount: 0,
    };
    meta.practiceClearedCount += clearedCount;
    lsSet(LS_META(uid), meta);
  }

  // --- Cosmos DB ---
  if (!isCosmosConfigured) return clearedCount;
  try {
    const writes: Promise<unknown>[] = [];

    for (const word of wordsNeedPractice) {
      const existing = await readDocument<PracticeWordDoc>(pwId(uid, word), uid).catch(() => null);
      const doc: PracticeWordDoc = {
        id: pwId(uid, word),
        uid,
        type: 'practiceWord',
        word,
        failCount: (existing?.failCount ?? 0) + 1,
        lastSeen: new Date().toISOString(),
      };
      writes.push(upsertDocument(doc as unknown as Record<string, unknown>));
    }

    for (const word of wordsNowCorrect) {
      writes.push(deleteDocument(pwId(uid, word), uid).catch(() => {}));
    }

    if (clearedCount > 0) {
      const existingMeta = await readDocument<MetaDoc>(metaId(uid), uid).catch(() => null);
      if (existingMeta) {
        existingMeta.practiceClearedCount = (existingMeta.practiceClearedCount ?? 0) + clearedCount;
        writes.push(upsertDocument(existingMeta as unknown as Record<string, unknown>));
      }
    }

    await Promise.allSettled(writes);
  } catch { /* non-fatal */ }

  return clearedCount;
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

export async function saveTrophies(uid: string, trophyIds: string[]): Promise<void> {
  if (trophyIds.length === 0) return;
  const now = new Date().toISOString();

  // --- localStorage ---
  const stored = lsGet<EarnedTrophy[]>(LS_TROPHIES(uid)) ?? [];
  for (const id of trophyIds) {
    if (!stored.find((t) => t.id === id)) stored.push({ id, earnedAt: now });
  }
  lsSet(LS_TROPHIES(uid), stored);

  // --- Cosmos DB ---
  if (!isCosmosConfigured) return;
  try {
    await Promise.allSettled(
      trophyIds.map((id) => {
        const doc: TrophyDoc = { id: trophyId(uid, id), uid, type: 'trophy', trophyId: id, earnedAt: now };
        return upsertDocument(doc as unknown as Record<string, unknown>);
      }),
    );
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Reading helpers
// ---------------------------------------------------------------------------

export async function loadSessions(uid: string): Promise<SessionRecord[]> {
  if (isCosmosConfigured) {
    try {
      // Project only SessionRecord fields — avoids returning uid/type Cosmos metadata
      const records = await queryDocuments<SessionRecord>(
        `SELECT c.id, c.date, c.title, c.score, c.stars, c.accuracy,
                c.wordCount, c.hardWordCount, c.hardWordCorrect, c.wordsNeedPractice
         FROM c WHERE c.uid = @uid AND c.type = "session"
         ORDER BY c.date DESC OFFSET 0 LIMIT 200`,
        [{ name: '@uid', value: uid }],
        uid,
      );
      lsSet(LS_SESSIONS(uid), records);
      return records;
    } catch { /* fall through */ }
  }
  return lsGet<SessionRecord[]>(LS_SESSIONS(uid)) ?? [];
}

export async function loadPracticeWords(uid: string): Promise<PracticeWord[]> {
  if (isCosmosConfigured) {
    try {
      const words = await queryDocuments<PracticeWord>(
        `SELECT c.word, c.failCount, c.lastSeen
         FROM c WHERE c.uid = @uid AND c.type = "practiceWord"
         ORDER BY c.failCount DESC OFFSET 0 LIMIT 500`,
        [{ name: '@uid', value: uid }],
        uid,
      );
      const stored: Record<string, PracticeWord> = {};
      words.forEach((w) => { stored[w.word] = w; });
      lsSet(LS_PRACTICE(uid), stored);
      return words;
    } catch { /* fall through */ }
  }
  const stored = lsGet<Record<string, PracticeWord>>(LS_PRACTICE(uid)) ?? {};
  return Object.values(stored).sort((a, b) => b.failCount - a.failCount);
}

export async function loadTrophies(uid: string): Promise<EarnedTrophy[]> {
  if (isCosmosConfigured) {
    try {
      const docs = await queryDocuments<TrophyDoc>(
        'SELECT * FROM c WHERE c.uid = @uid AND c.type = "trophy"',
        [{ name: '@uid', value: uid }],
        uid,
      );
      const trophies = docs.map((d) => ({ id: d.trophyId, earnedAt: d.earnedAt }));
      lsSet(LS_TROPHIES(uid), trophies);
      return trophies;
    } catch { /* fall through */ }
  }
  return lsGet<EarnedTrophy[]>(LS_TROPHIES(uid)) ?? [];
}

export async function loadUserProgress(uid: string): Promise<UserProgress> {
  if (isCosmosConfigured) {
    try {
      const metaDoc = await readDocument<MetaDoc>(metaId(uid), uid);
      if (metaDoc) {
        const sessions = await loadSessions(uid);
        return {
          sessionCount: metaDoc.sessionCount ?? 0,
          sessionDates: metaDoc.sessionDates ?? [],
          practiceClearedCount: metaDoc.practiceClearedCount ?? 0,
          latestSession: sessions[0] ?? null,
        };
      }
    } catch { /* fall through */ }
  }

  const meta = lsGet<{ sessionCount: number; sessionDates: string[]; practiceClearedCount: number }>(LS_META(uid)) ?? {
    sessionCount: 0, sessionDates: [], practiceClearedCount: 0,
  };
  const sessions = lsGet<SessionRecord[]>(LS_SESSIONS(uid)) ?? [];
  return { ...meta, latestSession: sessions[0] ?? null };
}
