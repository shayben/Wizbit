import { describe, it, expect, beforeEach, vi } from 'vitest';

const cosmos = vi.hoisted(() => ({
  isCosmosConfigured: false,
  readDocument: vi.fn(),
  upsertDocument: vi.fn(),
}));

vi.mock('../services/cosmosService', () => cosmos);

import { createScopedStore, effectiveUid } from '../services/scopedStore';

interface Counter { count: number }

function makeStore() {
  return createScopedStore<Counter>({
    key: 'counter',
    docType: 'counter',
    empty: () => ({ count: 0 }),
    parse: (raw) => {
      const value = (raw as Counter | null)?.count;
      return { count: typeof value === 'number' ? value : 0 };
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  cosmos.isCosmosConfigured = false;
  cosmos.readDocument.mockReset();
  cosmos.upsertDocument.mockReset();
});

describe('effectiveUid', () => {
  it('maps missing uids to a stable anonymous key', () => {
    expect(effectiveUid(null)).toBe('anon');
    expect(effectiveUid('')).toBe('anon');
    expect(effectiveUid('u1')).toBe('u1');
  });
});

describe('createScopedStore', () => {
  it('returns the empty value when nothing is stored', () => {
    expect(makeStore().readLocal('u1')).toEqual({ count: 0 });
  });

  it('round-trips a value through localStorage', async () => {
    const store = makeStore();
    await store.save('u1', { count: 7 });
    expect(store.readLocal('u1')).toEqual({ count: 7 });
    expect(await store.load('u1')).toEqual({ count: 7 });
  });

  it('keeps different scoped uids isolated', async () => {
    const store = makeStore();
    await store.save('acct::kid-a', { count: 3 });
    await store.save('acct::kid-b', { count: 9 });
    expect(store.readLocal('acct::kid-a')).toEqual({ count: 3 });
    expect(store.readLocal('acct::kid-b')).toEqual({ count: 9 });
  });

  it('sanitises corrupt stored JSON instead of throwing', () => {
    const store = makeStore();
    localStorage.setItem(store.localKey('u1'), '{not json');
    expect(store.readLocal('u1')).toEqual({ count: 0 });
  });

  it('runs parse over stored data so bad shapes are normalised', () => {
    const store = makeStore();
    localStorage.setItem(store.localKey('u1'), JSON.stringify({ count: 'lots' }));
    expect(store.readLocal('u1')).toEqual({ count: 0 });
  });

  it('update applies the mutation and persists the result', async () => {
    const store = makeStore();
    await store.save('u1', { count: 1 });
    const next = await store.update('u1', (c) => ({ count: c.count + 4 }));
    expect(next).toEqual({ count: 5 });
    expect(store.readLocal('u1')).toEqual({ count: 5 });
  });

  it('does not touch Cosmos when it is not configured', async () => {
    const store = makeStore();
    await store.save('u1', { count: 1 });
    await store.load('u1');
    expect(cosmos.upsertDocument).not.toHaveBeenCalled();
    expect(cosmos.readDocument).not.toHaveBeenCalled();
  });

  it('does not sync anonymous learners to Cosmos', async () => {
    cosmos.isCosmosConfigured = true;
    const store = makeStore();
    await store.save(null, { count: 2 });
    expect(cosmos.upsertDocument).not.toHaveBeenCalled();
  });

  it('prefers the Cosmos copy and refreshes the local cache', async () => {
    cosmos.isCosmosConfigured = true;
    cosmos.readDocument.mockResolvedValue({ data: { count: 42 } });
    const store = makeStore();
    await store.save('u1', { count: 1 });

    expect(await store.load('u1')).toEqual({ count: 42 });
    expect(store.readLocal('u1')).toEqual({ count: 42 });
  });

  it('falls back to the local cache when Cosmos read fails', async () => {
    cosmos.isCosmosConfigured = true;
    cosmos.readDocument.mockRejectedValue(new Error('offline'));
    const store = makeStore();
    await store.save('u1', { count: 5 });
    expect(await store.load('u1')).toEqual({ count: 5 });
  });

  it('still writes locally when the Cosmos upsert fails', async () => {
    cosmos.isCosmosConfigured = true;
    cosmos.upsertDocument.mockRejectedValue(new Error('offline'));
    const store = makeStore();
    await expect(store.save('u1', { count: 8 })).resolves.toBeUndefined();
    expect(store.readLocal('u1')).toEqual({ count: 8 });
  });

  it('writes a partition-keyed document with its type discriminator', async () => {
    cosmos.isCosmosConfigured = true;
    cosmos.upsertDocument.mockResolvedValue(undefined);
    await makeStore().save('u1', { count: 3 });
    expect(cosmos.upsertDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1_counter', uid: 'u1', type: 'counter', data: { count: 3 } }),
    );
  });
});
