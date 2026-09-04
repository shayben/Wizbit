import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import {
  BUDDIES,
  BUDDY_ACCESSORIES,
  MAX_STREAK_BONUS,
  XP_PER_ACTIVITY,
  XP_PER_CORRECT,
  accessoriesForLevel,
  applyBuddyXp,
  awardBuddyXp,
  buddyLevel,
  getBuddy,
  loadBuddyState,
  setActiveBuddy,
  unlockableBuddies,
  xpForLevel,
  xpForSession,
  type BuddyState,
} from '../services/buddyService';

const fresh: BuddyState = { xp: 0, unlocked: [BUDDIES[0].id], activeBuddyId: BUDDIES[0].id };

beforeEach(() => {
  localStorage.clear();
});

describe('buddy catalogue', () => {
  it('starts with a buddy available at zero XP', () => {
    expect(BUDDIES[0].unlockXp).toBe(0);
  });

  it('lists buddies in ascending unlock order', () => {
    const thresholds = BUDDIES.map((b) => b.unlockXp);
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
  });

  it('uses unique ids', () => {
    expect(new Set(BUDDIES.map((b) => b.id)).size).toBe(BUDDIES.length);
  });
});

describe('buddyLevel', () => {
  it('starts every learner at level 1', () => {
    expect(buddyLevel(0)).toMatchObject({ level: 1, xpIntoLevel: 0, percent: 0 });
  });

  it('levels up exactly at the threshold', () => {
    expect(buddyLevel(xpForLevel(1) - 1).level).toBe(1);
    expect(buddyLevel(xpForLevel(1)).level).toBe(2);
  });

  it('reports progress within the current level', () => {
    const level = buddyLevel(Math.floor(xpForLevel(1) / 2));
    expect(level.level).toBe(1);
    expect(level.percent).toBeGreaterThan(30);
    expect(level.percent).toBeLessThan(70);
  });

  it('needs progressively more XP per level', () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(5)).toBeGreaterThan(xpForLevel(4));
  });

  it('handles a large XP total without hanging', () => {
    expect(buddyLevel(100_000).level).toBeGreaterThan(10);
  });

  it('treats negative XP as zero', () => {
    expect(buddyLevel(-50).level).toBe(1);
  });
});

describe('xpForSession', () => {
  it('pays per correct answer', () => {
    expect(xpForSession(5, 0, false)).toBe(5 * XP_PER_CORRECT);
  });

  it('adds a completion bonus', () => {
    expect(xpForSession(5, 0, true)).toBe(5 * XP_PER_CORRECT + XP_PER_ACTIVITY);
  });

  it('rewards a streak but caps the bonus', () => {
    const capped = xpForSession(20, 100, false);
    const atCap = xpForSession(20, MAX_STREAK_BONUS, false);
    expect(capped).toBe(atCap);
  });

  it('awards nothing for a session with no correct answers and no completion', () => {
    expect(xpForSession(0, 0, false)).toBe(0);
  });

  it('never returns negative XP', () => {
    expect(xpForSession(-5, -3, false)).toBe(0);
  });
});

describe('unlockableBuddies / accessoriesForLevel', () => {
  it('unlocks more buddies as XP grows', () => {
    expect(unlockableBuddies(0)).toHaveLength(1);
    expect(unlockableBuddies(BUDDIES[1].unlockXp).length).toBeGreaterThan(1);
  });

  it('grants no accessories at level 1', () => {
    expect(accessoriesForLevel(1)).toEqual([]);
  });

  it('grants accessories cumulatively', () => {
    const high = accessoriesForLevel(99);
    expect(high).toHaveLength(BUDDY_ACCESSORIES.length);
  });
});

describe('applyBuddyXp', () => {
  it('adds XP and reports the new level', () => {
    const award = applyBuddyXp(fresh, 10);
    expect(award.state.xp).toBe(10);
    expect(award.xpGained).toBe(10);
    expect(award.leveledUp).toBe(false);
  });

  it('reports a level-up when the threshold is crossed', () => {
    const award = applyBuddyXp(fresh, xpForLevel(1));
    expect(award.leveledUp).toBe(true);
    expect(award.level.level).toBe(2);
  });

  it('reports newly unlocked buddies exactly once', () => {
    const first = applyBuddyXp(fresh, BUDDIES[1].unlockXp);
    expect(first.newBuddies.map((b) => b.id)).toContain(BUDDIES[1].id);

    const second = applyBuddyXp(first.state, 5);
    expect(second.newBuddies).toEqual([]);
  });

  it('reports accessories unlocked by a level-up', () => {
    const award = applyBuddyXp(fresh, xpForLevel(1));
    expect(award.newAccessories.map((a) => a.id)).toContain('hat');
  });

  it('does not re-report an accessory already earned', () => {
    const first = applyBuddyXp(fresh, xpForLevel(1));
    expect(applyBuddyXp(first.state, 1).newAccessories).toEqual([]);
  });

  it('ignores a negative award', () => {
    expect(applyBuddyXp(fresh, -100).state.xp).toBe(0);
  });

  it('does not mutate the input state', () => {
    applyBuddyXp(fresh, 500);
    expect(fresh.xp).toBe(0);
  });
});

describe('awardBuddyXp', () => {
  it('persists XP per learner', async () => {
    await awardBuddyXp('acct::kid', 30);
    expect((await loadBuddyState('acct::kid')).xp).toBe(30);
    expect((await loadBuddyState('acct::other')).xp).toBe(0);
  });

  it('accumulates across awards', async () => {
    await awardBuddyXp('acct::kid', 30);
    const award = await awardBuddyXp('acct::kid', 20);
    expect(award.state.xp).toBe(50);
  });

  it('always gives a new learner the starter buddy', async () => {
    expect((await loadBuddyState('acct::kid')).unlocked).toContain(BUDDIES[0].id);
  });
});

describe('setActiveBuddy', () => {
  it('switches to an unlocked buddy', async () => {
    await awardBuddyXp('acct::kid', BUDDIES[1].unlockXp);
    expect((await setActiveBuddy('acct::kid', BUDDIES[1].id)).activeBuddyId).toBe(BUDDIES[1].id);
  });

  it('ignores a buddy that is still locked', async () => {
    const state = await setActiveBuddy('acct::kid', BUDDIES[4].id);
    expect(state.activeBuddyId).toBe(BUDDIES[0].id);
  });
});

describe('getBuddy', () => {
  it('resolves a known id', () => {
    expect(getBuddy('pixel')?.name).toBe('Pixel the Fox');
  });

  it('returns undefined for an unknown or missing id', () => {
    expect(getBuddy('nope')).toBeUndefined();
    expect(getBuddy(null)).toBeUndefined();
  });
});
