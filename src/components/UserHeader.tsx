/**
 * User header — shown at the top of the home screen when a user is signed in.
 * Displays avatar, name, and a button to open the Progress Dashboard.
 */

import React from 'react';
import type { CurrentUser } from '../types/auth';

interface UserHeaderProps {
  user: CurrentUser;
  onOpenDashboard: () => void;
  onSignOut: () => void;
}

const UserHeader: React.FC<UserHeaderProps> = ({ user, onOpenDashboard, onSignOut }) => {
  const displayName = user.displayName ?? user.email ?? 'Reader';
  const firstName = displayName.split(' ')[0];

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

      <button
        type="button"
        onClick={onSignOut}
        className="text-xs md:text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  );
};

export default UserHeader;
