/**
 * Child profiles.
 *
 * One signed-in account (a parent) can hold several learners. Every other
 * service in the app persists against a uid, so profiles are implemented as a
 * *uid scope*: `scopeUid(accountUid, profileId)` produces the key that reading
 * history, practice words, math sessions, trophies and stickers are stored
 * under. Two children on one device therefore never pollute each other's
 * adaptive signals.
 *
 * The profile list itself is stored per account (unscoped), so it survives
 * switching between children.
 */

import { createScopedStore } from './scopedStore';
import { GRADES, isGradeCode, type GradeCode } from '../types/grade';

export interface ChildProfile {
  id: string;
  name: string;
  emoji: string;
  grade: GradeCode;
  createdAt: string;
}

export interface ProfileState {
  profiles: ChildProfile[];
  activeProfileId: string | null;
}

/** Matches the "Up to 4 child profiles" plan benefit. */
export const MAX_PROFILES = 4;

export const PROFILE_EMOJIS = ['🦊', '🐨', '🐼', '🦁', '🐸', '🦄', '🐙', '🦖', '🐝', '🦉', '🐢', '🦋'];

/** Separator between account uid and profile id in a scoped uid. */
const SCOPE_SEPARATOR = '::';

const store = createScopedStore<ProfileState>({
  key: 'profiles',
  docType: 'profiles',
  empty: () => ({ profiles: [], activeProfileId: null }),
  parse: parseProfileState,
});

export function parseProfileState(raw: unknown): ProfileState {
  const source = (raw ?? {}) as Partial<ProfileState>;
  const list = Array.isArray(source.profiles) ? source.profiles : [];
  const profiles: ChildProfile[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Partial<ChildProfile>;
    if (typeof candidate.id !== 'string' || !candidate.id) continue;
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) continue;
    if (profiles.some((p) => p.id === candidate.id)) continue;
    profiles.push({
      id: candidate.id,
      name: candidate.name.trim().slice(0, 24),
      emoji: typeof candidate.emoji === 'string' && candidate.emoji ? candidate.emoji : PROFILE_EMOJIS[0],
      grade: isGradeCode(candidate.grade) ? candidate.grade : '1',
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date(0).toISOString(),
    });
    if (profiles.length >= MAX_PROFILES) break;
  }

  const activeProfileId =
    typeof source.activeProfileId === 'string' && profiles.some((p) => p.id === source.activeProfileId)
      ? source.activeProfileId
      : null;

  return { profiles, activeProfileId };
}

/**
 * Storage key for one learner's data.
 *
 * Returns the bare account uid when no profile is selected, so accounts that
 * never create a profile keep the history they already had before profiles
 * existed.
 */
export function scopeUid(uid: string | null | undefined, profileId: string | null | undefined): string | null {
  if (!uid) return profileId ? `anon${SCOPE_SEPARATOR}${profileId}` : null;
  if (!profileId) return uid;
  return `${uid}${SCOPE_SEPARATOR}${profileId}`;
}

/** Split a scoped uid back into its parts. */
export function unscopeUid(scoped: string): { uid: string; profileId: string | null } {
  const index = scoped.indexOf(SCOPE_SEPARATOR);
  if (index === -1) return { uid: scoped, profileId: null };
  return { uid: scoped.slice(0, index), profileId: scoped.slice(index + SCOPE_SEPARATOR.length) };
}

function newProfileId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `p_${Date.now().toString(36)}_${random}`;
}

/** Pick the first emoji not already taken by another profile. */
export function suggestProfileEmoji(existing: ChildProfile[]): string {
  const taken = new Set(existing.map((p) => p.emoji));
  return PROFILE_EMOJIS.find((emoji) => !taken.has(emoji)) ?? PROFILE_EMOJIS[0];
}

export function loadProfileStateLocal(uid: string | null | undefined): ProfileState {
  return store.readLocal(uid);
}

export function loadProfileState(uid: string | null | undefined): Promise<ProfileState> {
  return store.load(uid);
}

export interface CreateProfileInput {
  name: string;
  grade: GradeCode;
  emoji?: string;
}

export class ProfileLimitError extends Error {
  constructor() {
    super(`You can have up to ${MAX_PROFILES} learners on one account.`);
    this.name = 'ProfileLimitError';
  }
}

/**
 * Add a learner and make them active.
 *
 * @throws {ProfileLimitError} when the account already holds {@link MAX_PROFILES}.
 */
export async function createProfile(
  uid: string | null | undefined,
  input: CreateProfileInput,
): Promise<ChildProfile> {
  const name = input.name.trim().slice(0, 24);
  if (!name) throw new Error('Enter a name for this learner.');

  const state = await loadProfileState(uid);
  if (state.profiles.length >= MAX_PROFILES) throw new ProfileLimitError();

  const profile: ChildProfile = {
    id: newProfileId(),
    name,
    emoji: input.emoji || suggestProfileEmoji(state.profiles),
    grade: input.grade,
    createdAt: new Date().toISOString(),
  };

  await store.save(uid, {
    profiles: [...state.profiles, profile],
    activeProfileId: profile.id,
  });
  return profile;
}

export async function updateProfile(
  uid: string | null | undefined,
  profileId: string,
  patch: Partial<Omit<ChildProfile, 'id' | 'createdAt'>>,
): Promise<ProfileState> {
  return store.update(uid, (state) => ({
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 24) || profile.name } : {}),
            ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
            ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
          }
        : profile,
    ),
  }));
}

/**
 * Remove a learner from the account list.
 *
 * Their scoped documents are intentionally left in place: deleting a profile
 * by accident should not destroy months of reading history, and re-adding a
 * learner with the same id restores it.
 */
export async function deleteProfile(
  uid: string | null | undefined,
  profileId: string,
): Promise<ProfileState> {
  return store.update(uid, (state) => {
    const profiles = state.profiles.filter((profile) => profile.id !== profileId);
    return {
      profiles,
      activeProfileId:
        state.activeProfileId === profileId ? (profiles[0]?.id ?? null) : state.activeProfileId,
    };
  });
}

export async function setActiveProfile(
  uid: string | null | undefined,
  profileId: string | null,
): Promise<ProfileState> {
  return store.update(uid, (state) => ({
    ...state,
    activeProfileId:
      profileId === null || state.profiles.some((p) => p.id === profileId) ? profileId : state.activeProfileId,
  }));
}

/** Resolve the active profile object from a state snapshot. */
export function activeProfileOf(state: ProfileState): ChildProfile | null {
  if (!state.activeProfileId) return null;
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
}

/** Grade options for the profile editor. */
export const PROFILE_GRADES = GRADES;
