/**
 * Buddy progression.
 *
 * The existing math buddies unlock at 3, 6 and 10 correct answers and then sit
 * inert. A companion that keeps growing outperforms a static badge grid at
 * these ages, so a buddy here earns XP from every learning area, levels up,
 * and unlocks accessories along the way.
 *
 * XP is awarded per correct answer with a streak bonus, so the reward curve
 * follows effort rather than raw session count.
 */

import { createScopedStore } from './scopedStore';

export interface Buddy {
  id: string;
  name: string;
  emoji: string;
  /** Total XP across all learners' activities needed before this buddy appears. */
  unlockXp: number;
  /** Short line shown when the buddy is unlocked. */
  tagline: string;
}

export interface BuddyAccessory {
  id: string;
  name: string;
  emoji: string;
  /** Buddy level at which this accessory unlocks. */
  level: number;
}

export interface BuddyState {
  xp: number;
  /** Ids of buddies the learner has unlocked. */
  unlocked: string[];
  /** The buddy currently shown alongside activities. */
  activeBuddyId: string | null;
}

export interface BuddyLevel {
  level: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to finish the current level. */
  xpForLevel: number;
  /** Progress through the current level, 0–100. */
  percent: number;
  /** Total XP required to reach the next level. */
  nextLevelXp: number;
}

export const BUDDIES: Buddy[] = [
  { id: 'pixel', name: 'Pixel the Fox', emoji: '🦊', unlockXp: 0, tagline: 'Pixel is ready to learn with you!' },
  { id: 'nova', name: 'Nova the Dragon', emoji: '🐉', unlockXp: 150, tagline: 'Nova breathes fire on tricky problems.' },
  { id: 'cosmo', name: 'Cosmo the Unicorn', emoji: '🦄', unlockXp: 400, tagline: 'Cosmo sparkles when you get a streak.' },
  { id: 'bolt', name: 'Bolt the Cheetah', emoji: '🐆', unlockXp: 800, tagline: 'Bolt loves fast facts.' },
  { id: 'sage', name: 'Sage the Owl', emoji: '🦉', unlockXp: 1500, tagline: 'Sage has read every book twice.' },
];

export const BUDDY_ACCESSORIES: BuddyAccessory[] = [
  { id: 'hat', name: 'Party hat', emoji: '🎉', level: 2 },
  { id: 'glasses', name: 'Reading glasses', emoji: '👓', level: 3 },
  { id: 'cape', name: 'Hero cape', emoji: '🦸', level: 5 },
  { id: 'crown', name: 'Golden crown', emoji: '👑', level: 8 },
  { id: 'rocket', name: 'Rocket boots', emoji: '🚀', level: 12 },
];

/** XP for one correct answer. */
export const XP_PER_CORRECT = 4;
/** Extra XP per answer once a streak is running, capped by {@link MAX_STREAK_BONUS}. */
export const XP_STREAK_BONUS = 1;
export const MAX_STREAK_BONUS = 6;
/** XP for finishing a whole activity. */
export const XP_PER_ACTIVITY = 15;

/** XP needed to advance from `level` to `level + 1`. Grows gently. */
export function xpForLevel(level: number): number {
  return 40 + Math.max(0, level - 1) * 20;
}

/** Resolve total XP into a level and progress within it. */
export function buddyLevel(totalXp: number): BuddyLevel {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  const needed = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForLevel: needed,
    percent: needed === 0 ? 0 : Math.round((remaining / needed) * 100),
    nextLevelXp: needed - remaining,
  };
}

/**
 * XP for a completed activity.
 *
 * @param correct     Number of correct answers.
 * @param bestStreak  Longest run of correct answers in the activity.
 * @param finished    Whether the learner completed the whole activity.
 */
export function xpForSession(correct: number, bestStreak: number, finished: boolean): number {
  const base = Math.max(0, correct) * XP_PER_CORRECT;
  const bonus = Math.min(Math.max(0, bestStreak), MAX_STREAK_BONUS) * XP_STREAK_BONUS;
  return base + bonus + (finished ? XP_PER_ACTIVITY : 0);
}

export function accessoriesForLevel(level: number): BuddyAccessory[] {
  return BUDDY_ACCESSORIES.filter((accessory) => accessory.level <= level);
}

/** Buddies whose XP threshold the learner has passed. */
export function unlockableBuddies(totalXp: number): Buddy[] {
  return BUDDIES.filter((buddy) => totalXp >= buddy.unlockXp);
}

function parseBuddyState(raw: unknown): BuddyState {
  const source = (raw ?? {}) as Partial<BuddyState>;
  const unlocked = Array.isArray(source.unlocked)
    ? source.unlocked.filter((id): id is string => typeof id === 'string' && BUDDIES.some((b) => b.id === id))
    : [];
  const xp = typeof source.xp === 'number' && source.xp > 0 ? Math.floor(source.xp) : 0;

  // The starter buddy is always available.
  const withStarter = unlocked.includes(BUDDIES[0].id) ? unlocked : [BUDDIES[0].id, ...unlocked];

  return {
    xp,
    unlocked: withStarter,
    activeBuddyId:
      typeof source.activeBuddyId === 'string' && withStarter.includes(source.activeBuddyId)
        ? source.activeBuddyId
        : withStarter[0] ?? null,
  };
}

const store = createScopedStore<BuddyState>({
  key: 'buddy',
  docType: 'buddy',
  empty: () => parseBuddyState({}),
  parse: parseBuddyState,
});

export function loadBuddyState(uid: string | null | undefined): Promise<BuddyState> {
  return store.load(uid);
}

export function loadBuddyStateLocal(uid: string | null | undefined): BuddyState {
  return store.readLocal(uid);
}

export interface BuddyAward {
  state: BuddyState;
  xpGained: number;
  /** Buddies unlocked by this award. */
  newBuddies: Buddy[];
  /** Accessories unlocked by this award. */
  newAccessories: BuddyAccessory[];
  /** True when the award crossed a level boundary. */
  leveledUp: boolean;
  level: BuddyLevel;
}

/** Fold an XP award into the state (pure) and report what it unlocked. */
export function applyBuddyXp(state: BuddyState, xpGained: number): BuddyAward {
  const gain = Math.max(0, Math.round(xpGained));
  const beforeLevel = buddyLevel(state.xp);
  const xp = state.xp + gain;
  const level = buddyLevel(xp);

  const unlockedNow = unlockableBuddies(xp);
  const newBuddies = unlockedNow.filter((buddy) => !state.unlocked.includes(buddy.id));

  const newAccessories = accessoriesForLevel(level.level)
    .filter((accessory) => accessory.level > beforeLevel.level);

  return {
    state: {
      xp,
      unlocked: [...state.unlocked, ...newBuddies.map((b) => b.id)],
      activeBuddyId: state.activeBuddyId ?? BUDDIES[0].id,
    },
    xpGained: gain,
    newBuddies,
    newAccessories,
    leveledUp: level.level > beforeLevel.level,
    level,
  };
}

/** Award XP and persist. */
export async function awardBuddyXp(uid: string | null | undefined, xpGained: number): Promise<BuddyAward> {
  const current = await loadBuddyState(uid);
  const award = applyBuddyXp(current, xpGained);
  await store.save(uid, award.state);
  return award;
}

export function setActiveBuddy(uid: string | null | undefined, buddyId: string): Promise<BuddyState> {
  return store.update(uid, (state) =>
    state.unlocked.includes(buddyId) ? { ...state, activeBuddyId: buddyId } : state,
  );
}

export function getBuddy(id: string | null | undefined): Buddy | undefined {
  return BUDDIES.find((buddy) => buddy.id === id);
}
