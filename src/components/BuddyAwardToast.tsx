/**
 * BuddyAwardToast — celebrates XP, level-ups and unlocks after an activity.
 *
 * A companion that visibly grows outperforms a static badge grid at this age,
 * so this is the moment the progression becomes real to the child.
 */

import React from 'react';
import type { BuddyAward } from '../services/buddyService';

export interface BuddyAwardToastProps {
  award: BuddyAward | null;
  onDismiss: () => void;
}

const BuddyAwardToast: React.FC<BuddyAwardToastProps> = ({ award, onDismiss }) => {
  if (!award) return null;

  const headline = award.newBuddies.length > 0
    ? 'New buddy unlocked!'
    : award.leveledUp
      ? `Level ${award.level.level}!`
      : `+${award.xpGained} XP`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-violet-950/40 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="buddy-award-title"
        className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl"
      >
        <div className="text-7xl" aria-hidden="true">
          {award.newBuddies[0]?.emoji ?? (award.leveledUp ? '🎊' : '⭐')}
        </div>
        <h2 id="buddy-award-title" className="text-2xl font-extrabold text-violet-700 mt-3">
          {headline}
        </h2>

        {award.newBuddies.length > 0 && (
          <p className="text-gray-600 font-semibold mt-2">{award.newBuddies[0].tagline}</p>
        )}

        {award.newAccessories.length > 0 && (
          <p className="text-gray-600 mt-2">
            Unlocked: {award.newAccessories.map((item) => `${item.emoji} ${item.name}`).join(', ')}
          </p>
        )}

        <div className="mt-4">
          <div className="h-3 rounded-full bg-violet-100 overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-500"
              style={{ width: `${award.level.percent}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {award.level.nextLevelXp} XP to level {award.level.level + 1}
          </p>
        </div>

        <button
          type="button"
          autoFocus
          onClick={onDismiss}
          className="w-full mt-6 py-3 rounded-2xl bg-violet-600 text-white font-bold active:bg-violet-700"
        >
          Keep going!
        </button>
      </div>
    </div>
  );
};

export default BuddyAwardToast;
