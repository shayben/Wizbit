/**
 * Scoped document store.
 *
 * Most learner state in Wizbit is a single JSON blob owned by one learner:
 * spaced-repetition schedules, sight-word progress, daily goals, buddy XP.
 * Each of those needs the same behaviour — write localStorage immediately so
 * the UI never waits, then best-effort mirror to Cosmos DB when the account is
 * signed in and Cosmos is configured.
 *
 * `createScopedStore` captures that pattern once. Callers supply a key, a
 * document type and a parser, and get back a small typed API.
 *
 * The `uid` passed to these functions is a *scoped* uid from
 * {@link ./profileService}, so two children on one account never share state.
 */

import { isCosmosConfigured, readDocument, upsertDocument } from './cosmosService';

export interface ScopedStore<T> {
  /** Synchronous read of the local cache — safe during render. */
  readLocal(uid: string | null | undefined): T;
  /** Local cache first, then Cosmos when available (Cosmos wins and re-caches). */
  load(uid: string | null | undefined): Promise<T>;
  /** Writes locally, then best-effort to Cosmos. Never throws. */
  save(uid: string | null | undefined, value: T): Promise<void>;
  /** Read-modify-write helper; returns the value that was stored. */
  update(uid: string | null | undefined, mutate: (current: T) => T): Promise<T>;
  /** localStorage key for a uid — exposed for tests and cleanup. */
  localKey(uid: string | null | undefined): string;
}

export interface ScopedStoreOptions<T> {
  /** Short key, e.g. `practice_srs`. Used for both storage key and doc id. */
  key: string;
  /** Cosmos `type` discriminator for the stored document. */
  docType: string;
  /** Value returned when nothing is stored yet. Must be a fresh object each call. */
  empty: () => T;
  /** Validate/normalise untrusted stored data. Should never throw. */
  parse: (raw: unknown) => T;
}

/** Anonymous learners still get isolated state under a stable local key. */
export function effectiveUid(uid: string | null | undefined): string {
  return uid && uid.length > 0 ? uid : 'anon';
}

/** True when this uid is a real signed-in account (and so may sync to Cosmos). */
function isSyncable(uid: string | null | undefined): uid is string {
  return Boolean(uid) && effectiveUid(uid) !== 'anon';
}

interface StoredDoc<T> {
  id: string;
  uid: string;
  type: string;
  data: T;
  updatedAt: string;
}

export function createScopedStore<T>({ key, docType, empty, parse }: ScopedStoreOptions<T>): ScopedStore<T> {
  const localKey = (uid: string | null | undefined) => `ra_${key}_${effectiveUid(uid)}`;
  const docId = (uid: string) => `${uid}_${key}`;

  function readLocal(uid: string | null | undefined): T {
    try {
      const raw = localStorage.getItem(localKey(uid));
      if (!raw) return empty();
      return parse(JSON.parse(raw));
    } catch {
      return empty();
    }
  }

  function writeLocal(uid: string | null | undefined, value: T): void {
    try {
      localStorage.setItem(localKey(uid), JSON.stringify(value));
    } catch { /* quota or unavailable — Cosmos may still hold the value */ }
  }

  async function load(uid: string | null | undefined): Promise<T> {
    const local = readLocal(uid);
    if (!isSyncable(uid) || !isCosmosConfigured) return local;
    try {
      const doc = await readDocument<StoredDoc<T>>(docId(uid), uid);
      if (doc && doc.data !== undefined && doc.data !== null) {
        const remote = parse(doc.data);
        writeLocal(uid, remote);
        return remote;
      }
    } catch { /* offline or transient — the local cache is authoritative */ }
    return local;
  }

  async function save(uid: string | null | undefined, value: T): Promise<void> {
    writeLocal(uid, value);
    if (!isSyncable(uid) || !isCosmosConfigured) return;
    try {
      const doc: StoredDoc<T> = {
        id: docId(uid),
        uid,
        type: docType,
        data: value,
        updatedAt: new Date().toISOString(),
      };
      await upsertDocument(doc as unknown as Record<string, unknown>);
    } catch { /* non-fatal */ }
  }

  async function update(uid: string | null | undefined, mutate: (current: T) => T): Promise<T> {
    const next = mutate(await load(uid));
    await save(uid, next);
    return next;
  }

  return { readLocal, load, save, update, localKey };
}
