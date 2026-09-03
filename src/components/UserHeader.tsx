/**
 * User header — shown at the top of the home screen when a user is signed in.
 * Displays avatar, name, and a button to open the Progress Dashboard.
 */

import React, { useCallback, useState } from 'react';
import type { CurrentUser } from '../types/auth';
import { apiGet } from '../services/apiClient';

interface UserHeaderProps {
  user: CurrentUser;
  onOpenDashboard: () => void;
  onSignOut: () => void;
}

interface AccountSnapshot {
  account: {
    uid: string;
    email: string | null;
    provider: 'microsoft' | 'google' | 'anonymous';
    isAdmin: boolean;
  };
  plan: string;
}

const UserHeader: React.FC<UserHeaderProps> = ({ user, onOpenDashboard, onSignOut }) => {
  const displayName = user.displayName ?? user.email ?? 'Reader';
  const firstName = displayName.split(' ')[0];
  const [showAccount, setShowAccount] = useState(false);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);

  const openAccount = useCallback(async () => {
    setShowAccount(true);
    setLoadingAccount(true);
    try {
      setSnapshot(await apiGet<AccountSnapshot>('/usage'));
    } catch {
      setSnapshot(null);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  return (
    <div className="flex items-center justify-between w-full max-w-xs md:max-w-md">
      <button
        type="button"
        onClick={onOpenDashboard}
        className="flex items-center gap-3 rounded-2xl hover:bg-indigo-50 active:bg-indigo-100 transition-colors p-2 -m-2"
        title="Open my progress"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={displayName}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover border-2 border-indigo-200"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-lg md:text-xl">
            {firstName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-left">
          <p className="text-sm md:text-base font-semibold text-indigo-700 leading-tight">{firstName}</p>
          <p className="text-xs md:text-sm text-indigo-400 leading-tight">My Progress 📊</p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openAccount}
          className="text-xs md:text-sm text-indigo-500 hover:text-indigo-700 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
        >
          Account
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="text-xs md:text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
          title="Sign out"
        >
          Sign out
        </button>
      </div>

      {showAccount && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-title"
          onClick={() => setShowAccount(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAccount(false)}
              aria-label="Close account details"
              className="absolute right-4 top-4 h-10 w-10 rounded-full bg-gray-100 text-gray-600"
            >
              ✕
            </button>
            <h2 id="account-title" className="mb-5 text-xl font-bold text-indigo-700">Account details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-400">Name</dt>
                <dd className="font-medium text-gray-800">{user.displayName ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Email</dt>
                <dd className="break-all font-medium text-gray-800">{user.email ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Sign-in provider</dt>
                <dd className="font-medium capitalize text-gray-800">{user.provider}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Account ID</dt>
                <dd className="break-all font-mono text-xs text-gray-600">{user.uid}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Access</dt>
                <dd className="font-medium text-gray-800">
                  {loadingAccount
                    ? 'Checking…'
                    : snapshot?.account.isAdmin
                      ? 'Administrator — quotas disabled'
                      : snapshot?.plan ?? 'Standard'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserHeader;
