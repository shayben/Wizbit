import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false,
  readDocument: vi.fn(),
  upsertDocument: vi.fn(),
}));

import {
  MAX_PROFILES,
  PROFILE_EMOJIS,
  ProfileLimitError,
  activeProfileOf,
  createProfile,
  deleteProfile,
  loadProfileState,
  loadProfileStateLocal,
  parseProfileState,
  scopeUid,
  setActiveProfile,
  suggestProfileEmoji,
  unscopeUid,
  updateProfile,
} from '../services/profileService';

beforeEach(() => localStorage.clear());

describe('scopeUid', () => {
  it('scopes an account uid by profile', () => {
    expect(scopeUid('acct', 'p1')).toBe('acct::p1');
  });

  it('falls back to the bare account uid when no profile is selected', () => {
    expect(scopeUid('acct', null)).toBe('acct');
  });

  it('returns null for a fully anonymous, profile-less learner', () => {
    expect(scopeUid(null, null)).toBeNull();
  });

  it('still isolates anonymous profiles from each other', () => {
    expect(scopeUid(null, 'p1')).toBe('anon::p1');
    expect(scopeUid(null, 'p1')).not.toBe(scopeUid(null, 'p2'));
  });

  it('produces different scopes for two children of one account', () => {
    expect(scopeUid('acct', 'a')).not.toBe(scopeUid('acct', 'b'));
  });
});

describe('unscopeUid', () => {
  it('round-trips a scoped uid', () => {
    expect(unscopeUid(scopeUid('acct', 'p1')!)).toEqual({ uid: 'acct', profileId: 'p1' });
  });

  it('treats an unscoped uid as having no profile', () => {
    expect(unscopeUid('acct')).toEqual({ uid: 'acct', profileId: null });
  });
});

describe('createProfile', () => {
  it('adds a learner and makes them active', async () => {
    const profile = await createProfile('acct', { name: 'Maya', grade: '3' });
    const state = await loadProfileState('acct');
    expect(state.profiles).toHaveLength(1);
    expect(state.activeProfileId).toBe(profile.id);
    expect(activeProfileOf(state)?.name).toBe('Maya');
  });

  it('assigns a distinct emoji to each learner', async () => {
    const first = await createProfile('acct', { name: 'A', grade: '1' });
    const second = await createProfile('acct', { name: 'B', grade: '3' });
    expect(first.emoji).not.toBe(second.emoji);
  });

  it('trims the name and rejects an empty one', async () => {
    expect((await createProfile('acct', { name: '  Ben  ', grade: '1' })).name).toBe('Ben');
    await expect(createProfile('acct', { name: '   ', grade: '1' })).rejects.toThrow();
  });

  it('enforces the four-learner limit', async () => {
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      await createProfile('acct', { name: `Kid ${i}`, grade: '1' });
    }
    await expect(createProfile('acct', { name: 'Fifth', grade: '1' })).rejects.toBeInstanceOf(ProfileLimitError);
  });

  it('keeps separate accounts independent', async () => {
    await createProfile('acct-a', { name: 'Maya', grade: '3' });
    expect((await loadProfileState('acct-b')).profiles).toHaveLength(0);
  });
});

describe('updateProfile', () => {
  it('changes the grade without disturbing other fields', async () => {
    const profile = await createProfile('acct', { name: 'Maya', grade: '1' });
    const state = await updateProfile('acct', profile.id, { grade: '3' });
    expect(state.profiles[0]).toMatchObject({ name: 'Maya', grade: '3', id: profile.id });
  });

  it('ignores an empty name rather than blanking the profile', async () => {
    const profile = await createProfile('acct', { name: 'Maya', grade: '1' });
    const state = await updateProfile('acct', profile.id, { name: '   ' });
    expect(state.profiles[0].name).toBe('Maya');
  });

  it('leaves other learners untouched', async () => {
    const first = await createProfile('acct', { name: 'A', grade: '1' });
    await createProfile('acct', { name: 'B', grade: '3' });
    const state = await updateProfile('acct', first.id, { name: 'Changed' });
    expect(state.profiles.map((p) => p.name)).toEqual(['Changed', 'B']);
  });
});

describe('deleteProfile', () => {
  it('removes the learner and reassigns the active slot', async () => {
    const first = await createProfile('acct', { name: 'A', grade: '1' });
    const second = await createProfile('acct', { name: 'B', grade: '3' });
    const state = await deleteProfile('acct', second.id);
    expect(state.profiles.map((p) => p.id)).toEqual([first.id]);
    expect(state.activeProfileId).toBe(first.id);
  });

  it('clears the active slot when the last learner goes', async () => {
    const only = await createProfile('acct', { name: 'A', grade: '1' });
    expect((await deleteProfile('acct', only.id)).activeProfileId).toBeNull();
  });

  it('frees up a slot against the limit', async () => {
    const ids = [];
    for (let i = 0; i < MAX_PROFILES; i += 1) {
      ids.push((await createProfile('acct', { name: `Kid ${i}`, grade: '1' })).id);
    }
    await deleteProfile('acct', ids[0]);
    await expect(createProfile('acct', { name: 'New', grade: '2' })).resolves.toBeDefined();
  });
});

describe('setActiveProfile', () => {
  it('switches the active learner', async () => {
    const first = await createProfile('acct', { name: 'A', grade: '1' });
    await createProfile('acct', { name: 'B', grade: '3' });
    expect((await setActiveProfile('acct', first.id)).activeProfileId).toBe(first.id);
  });

  it('ignores an unknown profile id', async () => {
    const profile = await createProfile('acct', { name: 'A', grade: '1' });
    expect((await setActiveProfile('acct', 'nope')).activeProfileId).toBe(profile.id);
  });

  it('accepts null to return to the account-level picker', async () => {
    await createProfile('acct', { name: 'A', grade: '1' });
    expect((await setActiveProfile('acct', null)).activeProfileId).toBeNull();
  });
});

describe('suggestProfileEmoji', () => {
  it('avoids emojis already in use', () => {
    const taken = PROFILE_EMOJIS.slice(0, 3).map((emoji, i) => ({
      id: `${i}`, name: 'x', emoji, grade: '1' as const, createdAt: '',
    }));
    expect(suggestProfileEmoji(taken)).toBe(PROFILE_EMOJIS[3]);
  });

  it('falls back to the first emoji when everything is taken', () => {
    const taken = PROFILE_EMOJIS.map((emoji, i) => ({
      id: `${i}`, name: 'x', emoji, grade: '1' as const, createdAt: '',
    }));
    expect(suggestProfileEmoji(taken)).toBe(PROFILE_EMOJIS[0]);
  });
});

describe('parseProfileState', () => {
  it('drops malformed entries and duplicate ids', () => {
    const state = parseProfileState({
      profiles: [
        { id: 'a', name: 'Maya', grade: '3', emoji: '🦊', createdAt: '' },
        { id: 'a', name: 'Duplicate', grade: '1' },
        { name: 'No id', grade: '1' },
        { id: 'b', name: '   ' },
        'nonsense',
      ],
      activeProfileId: 'a',
    });
    expect(state.profiles.map((p) => p.id)).toEqual(['a']);
    expect(state.activeProfileId).toBe('a');
  });

  it('clears an active id that no longer resolves', () => {
    expect(parseProfileState({ profiles: [], activeProfileId: 'ghost' }).activeProfileId).toBeNull();
  });

  it('defaults an invalid grade to grade 1', () => {
    const state = parseProfileState({ profiles: [{ id: 'a', name: 'Maya', grade: '12' }] });
    expect(state.profiles[0].grade).toBe('1');
  });

  it('never exceeds the profile limit even from corrupt storage', () => {
    const profiles = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Kid ${i}`, grade: '1' }));
    expect(parseProfileState({ profiles }).profiles).toHaveLength(MAX_PROFILES);
  });

  it('returns an empty state for junk input', () => {
    expect(parseProfileState(null)).toEqual({ profiles: [], activeProfileId: null });
  });
});

describe('loadProfileStateLocal', () => {
  it('reads synchronously after a write', async () => {
    await createProfile('acct', { name: 'Maya', grade: '3' });
    expect(loadProfileStateLocal('acct').profiles[0].name).toBe('Maya');
  });
});
