/**
 * ProfilePicker — choose or manage the learner using the app.
 *
 * Shown before the learning areas whenever an account has more than one child
 * (or none yet). Without this, siblings sharing a device share one progress
 * record, which corrupts every adaptive signal in the app.
 */

import React, { useState } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import {
  MAX_PROFILES,
  PROFILE_EMOJIS,
  PROFILE_GRADES,
  suggestProfileEmoji,
} from '../services/profileService';
import type { GradeCode } from '../types/grade';

export interface ProfilePickerProps {
  /** Called once a learner is selected. */
  onDone: () => void;
  /** Allow leaving without picking (when a learner is already active). */
  onCancel?: () => void;
}

const ProfilePicker: React.FC<ProfilePickerProps> = ({ onDone, onCancel }) => {
  const { profiles, activeProfile, createProfile, deleteProfile, selectProfile } = useProfile();

  const [adding, setAdding] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<GradeCode>('1');
  const [emoji, setEmoji] = useState(() => suggestProfileEmoji(profiles));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const atLimit = profiles.length >= MAX_PROFILES;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await createProfile({ name, grade, emoji });
      setName('');
      setAdding(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this learner.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelect(id: string) {
    await selectProfile(id);
    onDone();
  }

  async function handleDelete(id: string, learnerName: string) {
    if (busy) return;
    const confirmed = window.confirm(
      `Remove ${learnerName} from this device? Their saved progress is kept and comes back if you add them again.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteProfile(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-6 pt-12 md:pt-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-indigo-700 text-center">Who's learning?</h1>
        <p className="text-gray-400 text-center mt-2 mb-8">
          Everyone gets their own progress, stickers and practice list.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="relative">
              <button
                type="button"
                onClick={() => handleSelect(profile.id)}
                aria-label={`Choose ${profile.name}`}
                aria-pressed={profile.id === activeProfile?.id}
                className={`w-full rounded-3xl border-2 bg-white p-5 shadow-sm transition-colors
                            active:bg-indigo-50 ${
                              profile.id === activeProfile?.id
                                ? 'border-indigo-500 ring-2 ring-indigo-100'
                                : 'border-gray-100'
                            }`}
              >
                <span className="block text-5xl md:text-6xl" aria-hidden="true">{profile.emoji}</span>
                <span className="block font-bold text-indigo-700 mt-3 truncate">{profile.name}</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {PROFILE_GRADES.find((g) => g.grade === profile.grade)?.label}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(profile.id, profile.name)}
                aria-label={`Remove ${profile.name}`}
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-200 text-gray-600
                           text-sm font-bold grid place-items-center active:bg-gray-300"
              >
                ✕
              </button>
            </div>
          ))}

          {!adding && !atLimit && (
            <button
              type="button"
              onClick={() => { setEmoji(suggestProfileEmoji(profiles)); setAdding(true); }}
              className="rounded-3xl border-2 border-dashed border-indigo-200 p-5 text-indigo-500
                         active:bg-indigo-50 transition-colors"
            >
              <span className="block text-5xl md:text-6xl" aria-hidden="true">＋</span>
              <span className="block font-bold mt-3">Add learner</span>
            </button>
          )}
        </div>

        {atLimit && !adding && (
          <p className="text-center text-sm text-gray-400 mt-4">
            You have the maximum of {MAX_PROFILES} learners.
          </p>
        )}

        {adding && (
          <form onSubmit={handleCreate} className="mt-8 rounded-3xl border border-indigo-100 bg-white p-5 md:p-6">
            <h2 className="font-bold text-indigo-700 text-lg mb-4">Add a learner</h2>

            <label htmlFor="profile-name" className="block text-sm font-semibold text-gray-600 mb-1">
              Name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              autoFocus
              placeholder="First name"
              className="w-full rounded-2xl border-2 border-indigo-100 px-4 py-3 text-lg
                         outline-none focus:border-indigo-400"
            />

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-gray-600 mb-2">Grade</legend>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {PROFILE_GRADES.map((item) => (
                  <button
                    key={item.grade}
                    type="button"
                    aria-pressed={grade === item.grade}
                    onClick={() => setGrade(item.grade)}
                    className={`rounded-2xl border-2 py-3 text-sm font-bold transition-colors ${
                      grade === item.grade
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-100 text-gray-500'
                    }`}
                  >
                    <span className="block text-xl" aria-hidden="true">{item.emoji}</span>
                    {item.grade === 'K' ? 'K' : item.grade}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-gray-600 mb-2">Pick an animal</legend>
              <div className="flex flex-wrap gap-2">
                {PROFILE_EMOJIS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Choose ${option}`}
                    aria-pressed={emoji === option}
                    onClick={() => setEmoji(option)}
                    className={`w-12 h-12 rounded-2xl border-2 text-2xl transition-colors ${
                      emoji === option ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

            <div className="flex gap-3 mt-5">
              <button
                type="submit"
                disabled={busy || name.trim().length === 0}
                className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold
                           active:bg-indigo-700 disabled:bg-indigo-200"
              >
                Add learner
              </button>
              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setAdding(false); setError(''); }}
                  className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-500 font-bold"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {onCancel && activeProfile && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full mt-8 py-3 text-gray-400 font-medium"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
};

export default ProfilePicker;
