/**
 * Profile context.
 *
 * Exposes the active learner and — critically — `scopedUid`, the storage key
 * every other service should use in place of the raw account uid. Components
 * read `scopedUid` and stay unaware that profiles exist at all.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  activeProfileOf,
  createProfile as createProfileService,
  deleteProfile as deleteProfileService,
  loadProfileState,
  loadProfileStateLocal,
  scopeUid,
  setActiveProfile as setActiveProfileService,
  updateProfile as updateProfileService,
  type ChildProfile,
  type CreateProfileInput,
  type ProfileState,
} from '../services/profileService';
import { useAuth } from './AuthContext';
import type { GradeCode } from '../types/grade';

interface ProfileContextValue {
  profiles: ChildProfile[];
  activeProfile: ChildProfile | null;
  /** Storage key for the active learner; null only when nothing is resolvable. */
  scopedUid: string | null;
  /** Grade to use for level-aware content; falls back to grade 1. */
  grade: GradeCode;
  loading: boolean;
  createProfile: (input: CreateProfileInput) => Promise<ChildProfile>;
  updateProfile: (id: string, patch: Partial<Omit<ChildProfile, 'id' | 'createdAt'>>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  selectProfile: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_STATE: ProfileState = { profiles: [], activeProfileId: null };

const ProfileContext = createContext<ProfileContextValue>({
  profiles: [],
  activeProfile: null,
  scopedUid: null,
  grade: '1',
  loading: true,
  createProfile: async () => { throw new Error('ProfileProvider is missing'); },
  updateProfile: async () => {},
  deleteProfile: async () => {},
  selectProfile: async () => {},
  refresh: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // The cached state is tagged with the uid it belongs to, so switching
  // accounts shows an empty list rather than the previous account's learners
  // while the new one loads — without resetting state from inside an effect.
  const [entry, setEntry] = useState<{ uid: string | null; state: ProfileState }>(
    () => ({ uid, state: loadProfileStateLocal(uid) }),
  );
  const [loadedUid, setLoadedUid] = useState<string | null | undefined>(undefined);

  const state = entry.uid === uid ? entry.state : EMPTY_STATE;
  const loading = loadedUid !== uid;

  const refresh = useCallback(async () => {
    setEntry({ uid, state: await loadProfileState(uid) });
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    loadProfileState(uid)
      .then((next) => { if (!cancelled) setEntry({ uid, state: next }); })
      .catch(() => { if (!cancelled) setEntry({ uid, state: EMPTY_STATE }); })
      .finally(() => { if (!cancelled) setLoadedUid(uid); });
    return () => { cancelled = true; };
  }, [uid]);

  const createProfile = useCallback(async (input: CreateProfileInput) => {
    const profile = await createProfileService(uid, input);
    await refresh();
    return profile;
  }, [uid, refresh]);

  const updateProfile = useCallback(async (
    id: string,
    patch: Partial<Omit<ChildProfile, 'id' | 'createdAt'>>,
  ) => {
    setEntry({ uid, state: await updateProfileService(uid, id, patch) });
  }, [uid]);

  const deleteProfile = useCallback(async (id: string) => {
    setEntry({ uid, state: await deleteProfileService(uid, id) });
  }, [uid]);

  const selectProfile = useCallback(async (id: string | null) => {
    setEntry({ uid, state: await setActiveProfileService(uid, id) });
  }, [uid]);

  const activeProfile = useMemo(() => activeProfileOf(state), [state]);

  const value = useMemo<ProfileContextValue>(() => ({
    profiles: state.profiles,
    activeProfile,
    scopedUid: scopeUid(uid, activeProfile?.id ?? null),
    grade: activeProfile?.grade ?? '1',
    loading,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    refresh,
  }), [state.profiles, activeProfile, uid, loading, createProfile, updateProfile, deleteProfile, selectProfile, refresh]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile() {
  return useContext(ProfileContext);
}
