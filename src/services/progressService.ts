/**
 * Progress service — persists reading history, practice words, and trophies
 * to Firestore (when Firebase is configured) with a localStorage cache/fallback.
 *
 * Firestore structure:
 *   users/{uid}/
 *     meta (document):
 *       displayName, sessionCount, sessionDates[], practiceClearedCount
 *     sessions/{sessionId} (subcollection documents):
 *       date, title, score, stars, accuracy, wordCount,
 *       hardWordCount, hardWordCorrect, wordsNeedPractice[]
 *     practiceWords/{word} (subcollection documents):
 *       word, failCount, lastSeen, sessionIds[]
 *     trophies/{trophyId} (subcollection documents):
 *       id, earnedAt
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, serverTimestamp,
  increment, arrayUnion,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebaseService';

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
// Local-storage keys (fallback / offline cache)
// ---------------------------------------------------------------------------

const LS_SESSIONS      = (uid: string) => `ra_sessions_${uid}`;
const LS_PRACTICE      = (uid: string) => `ra_practice_${uid}`;
const LS_TROPHIES      = (uid: string) => `ra_trophies_${uid}`;
const LS_META          = (uid: string) => `ra_meta_${uid}`;

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded etc. */ }
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

  // --- Firestore ---
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId), {
      ...record,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', uid, 'meta'), {
      sessionCount: increment(1),
      sessionDates: arrayUnion(todayISO()),
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      // meta doc might not exist yet
      await setDoc(doc(db!, 'users', uid, 'meta'), {
        sessionCount: 1,
        sessionDates: [todayISO()],
        practiceClearedCount: 0,
        updatedAt: serverTimestamp(),
      });
    });
  } catch { /* non-fatal — data already saved to localStorage */ }
}

// ---------------------------------------------------------------------------
// Practice words
// ---------------------------------------------------------------------------

export async function updatePracticeWords(
  uid: string,
  wordsNeedPractice: string[],
  wordsNowCorrect: string[],
  sessionId: string,
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

  // Update cleared count in meta
  if (clearedCount > 0) {
    const meta = lsGet<{ sessionCount: number; sessionDates: string[]; practiceClearedCount: number }>(LS_META(uid)) ?? {
      sessionCount: 0, sessionDates: [], practiceClearedCount: 0,
    };
    meta.practiceClearedCount += clearedCount;
    lsSet(LS_META(uid), meta);
  }

  // --- Firestore ---
  if (!db) return clearedCount;
  try {
    const writes: Promise<unknown>[] = [];
    for (const word of wordsNeedPractice) {
      writes.push(
        updateDoc(doc(db, 'users', uid, 'practiceWords', word), {
          failCount: increment(1),
          lastSeen: new Date().toISOString(),
          sessionIds: arrayUnion(sessionId),
        }).catch(() =>
          setDoc(doc(db!, 'users', uid, 'practiceWords', word), {
            word,
            failCount: 1,
            lastSeen: new Date().toISOString(),
            sessionIds: [sessionId],
          }),
        ),
      );
    }
    for (const word of wordsNowCorrect) {
      writes.push(deleteDoc(doc(db, 'users', uid, 'practiceWords', word)));
    }
    if (clearedCount > 0) {
      writes.push(
        updateDoc(doc(db, 'users', uid, 'meta'), {
          practiceClearedCount: increment(clearedCount),
        }).catch(() => Promise.resolve()),
      );
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
    if (!stored.find((t) => t.id === id)) {
      stored.push({ id, earnedAt: now });
    }
  }
  lsSet(LS_TROPHIES(uid), stored);

  // --- Firestore ---
  if (!db) return;
  try {
    await Promise.allSettled(
      trophyIds.map((id) =>
        setDoc(doc(db!, 'users', uid, 'trophies', id), { id, earnedAt: now }),
      ),
    );
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Reading helpers
// ---------------------------------------------------------------------------

export async function loadSessions(uid: string): Promise<SessionRecord[]> {
  // Try Firestore first
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'sessions'));
      const records = snap.docs.map((d) => d.data() as SessionRecord);
      records.sort((a, b) => b.date.localeCompare(a.date));
      lsSet(LS_SESSIONS(uid), records.slice(0, 200));
      return records;
    } catch { /* fall through to localStorage */ }
  }
  return lsGet<SessionRecord[]>(LS_SESSIONS(uid)) ?? [];
}

export async function loadPracticeWords(uid: string): Promise<PracticeWord[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'practiceWords'));
      const words = snap.docs.map((d) => d.data() as PracticeWord);
      const stored: Record<string, PracticeWord> = {};
      words.forEach((w) => { stored[w.word] = w; });
      lsSet(LS_PRACTICE(uid), stored);
      return words.sort((a, b) => b.failCount - a.failCount);
    } catch { /* fall through */ }
  }
  const stored = lsGet<Record<string, PracticeWord>>(LS_PRACTICE(uid)) ?? {};
  return Object.values(stored).sort((a, b) => b.failCount - a.failCount);
}

export async function loadTrophies(uid: string): Promise<EarnedTrophy[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'trophies'));
      const trophies = snap.docs.map((d) => d.data() as EarnedTrophy);
      lsSet(LS_TROPHIES(uid), trophies);
      return trophies;
    } catch { /* fall through */ }
  }
  return lsGet<EarnedTrophy[]>(LS_TROPHIES(uid)) ?? [];
}

export async function loadUserProgress(uid: string): Promise<UserProgress> {
  // Try Firestore
  if (db) {
    try {
      const metaSnap = await getDoc(doc(db, 'users', uid, 'meta'));
      if (metaSnap.exists()) {
        const data = metaSnap.data() as DocumentData;
        const sessions = await loadSessions(uid);
        return {
          sessionCount: (data.sessionCount as number) ?? 0,
          sessionDates: (data.sessionDates as string[]) ?? [],
          practiceClearedCount: (data.practiceClearedCount as number) ?? 0,
          latestSession: sessions[0] ?? null,
        };
      }
    } catch { /* fall through */ }
  }

  // localStorage fallback
  const meta = lsGet<{ sessionCount: number; sessionDates: string[]; practiceClearedCount: number }>(LS_META(uid)) ?? {
    sessionCount: 0, sessionDates: [], practiceClearedCount: 0,
  };
  const sessions = lsGet<SessionRecord[]>(LS_SESSIONS(uid)) ?? [];
  return {
    ...meta,
    latestSession: sessions[0] ?? null,
  };
}
