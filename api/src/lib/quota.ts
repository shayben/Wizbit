/**
 * Per-user daily usage metering & rate limits.
 *
 * Limits are keyed by (caller, purpose, UTC date). The unit charged is per
 * purpose — e.g. 1 OCR call, 1 chapter generation, N translator characters,
 * N speech minutes. Calls are reserved BEFORE the upstream request so that
 * refunds (on upstream failure) are an explicit, optional follow-up.
 *
 * Storage:
 *   - Cosmos `usage` container, partition /uid
 *   - id = `${uid}|${yyyymmdd}`
 *   - schema: { id, uid, date, type:'usage', counters: {ocr, story, ...} }
 *
 * Falls back to an in-memory map when Cosmos is not configured (dev/test).
 */

import { getCosmos } from './cosmos.js';
import { config } from './config.js';
import type { Caller } from './auth.js';

export type Purpose =
  | 'ocr'
  | 'story-chapter'
  | 'moments'
  | 'translate-batch'
  | 'translate-word'
  | 'sticker-image'
  | 'speech-minutes';

export type Plan = 'free' | 'trialing' | 'premium' | 'past_due' | 'canceled';

interface PlanLimits {
  /** Maximum units per UTC day. */
  ocr: number;
  'story-chapter': number;
  moments: number;
  'translate-batch': number;
  'translate-word': number;
  'sticker-image': number;
  /** Speech recognition minutes per day (charged in whole minutes). */
  'speech-minutes': number;
}

const PREMIUM_LIMITS: PlanLimits = {
  ocr: 200,
  'story-chapter': 100,
  moments: 200,
  'translate-batch': 200,
  'translate-word': 1000,
  'sticker-image': 50,
  'speech-minutes': 500,
};

const FREE_LIMITS: PlanLimits = {
  ocr: 3,
  'story-chapter': 1,
  moments: 5,
  'translate-batch': 10,
  'translate-word': 50,
  'sticker-image': 0,
  'speech-minutes': 10,
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: FREE_LIMITS,
  trialing: PREMIUM_LIMITS,
  premium: PREMIUM_LIMITS,
  past_due: FREE_LIMITS,
  canceled: FREE_LIMITS,
};

export function planForCaller(planRaw: string | undefined): Plan {
  switch (planRaw) {
    case 'trialing':
    case 'premium':
    case 'past_due':
    case 'canceled':
      return planRaw;
    default:
      return 'free';
  }
}

/* ------------------------------------------------------------------------ */
/*  Storage backends                                                         */
/* ------------------------------------------------------------------------ */

interface UsageDoc {
  id: string;
  uid: string;
  date: string;
  type: 'usage';
  counters: Partial<Record<Purpose, number>>;
  ttl?: number;
}

interface UserDoc {
  id: string;
  uid: string;
  type: 'user';
  plan: Plan;
  email?: string;
  provider?: string;
  updatedAt: string;
}

const memUsage = new Map<string, UsageDoc>();
const memUsers = new Map<string, UserDoc>();

function utcDate(now = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
}

async function loadUserPlan(uid: string): Promise<Plan> {
  const cosmos = await getCosmos();
  if (!cosmos) {
    return memUsers.get(uid)?.plan ?? 'free';
  }
  try {
    const { resource } = await cosmos.users.item(uid, uid).read<UserDoc>();
    return planForCaller(resource?.plan);
  } catch {
    return 'free';
  }
}

async function loadUsage(uid: string, date: string): Promise<UsageDoc> {
  const id = `${uid}|${date}`;
  const cosmos = await getCosmos();
  if (!cosmos) {
    return memUsage.get(id) ?? { id, uid, date, type: 'usage', counters: {} };
  }
  try {
    const { resource } = await cosmos.usage.item(id, uid).read<UsageDoc>();
    return resource ?? { id, uid, date, type: 'usage', counters: {} };
  } catch {
    return { id, uid, date, type: 'usage', counters: {} };
  }
}

async function saveUsage(doc: UsageDoc): Promise<void> {
  const cosmos = await getCosmos();
  if (!cosmos) {
    memUsage.set(doc.id, doc);
    return;
  }
  await cosmos.usage.items.upsert<UsageDoc>(doc);
}

/* ------------------------------------------------------------------------ */
/*  Public API                                                               */
/* ------------------------------------------------------------------------ */

export interface ChargeResult {
  ok: true;
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
}

export interface ChargeDenied {
  ok: false;
  plan: Plan;
  used: number;
  limit: number;
  retryAt: string;
}

/**
 * Reserve `amount` units of `purpose` for `caller`. If the caller would
 * exceed today's limit, returns `{ok:false}` and does NOT charge.
 */
export async function charge(
  caller: Caller,
  purpose: Purpose,
  amount = 1,
): Promise<ChargeResult | ChargeDenied> {
  const date = utcDate();
  const plan = await loadUserPlan(caller.uid);
  const baseLimit = PLAN_LIMITS[plan][purpose];
  const limit = caller.provider === 'anonymous'
    ? Math.max(0, Math.floor(baseLimit * config.policy.anonymousMultiplier))
    : baseLimit;

  const doc = await loadUsage(caller.uid, date);
  const used = doc.counters[purpose] ?? 0;

  if (used + amount > limit) {
    return {
      ok: false,
      plan,
      used,
      limit,
      retryAt: nextUtcMidnight().toISOString(),
    };
  }

  doc.counters[purpose] = used + amount;
  // 90-day TTL set on document insert; refresh on update too.
  doc.ttl = 60 * 60 * 24 * 90;
  await saveUsage(doc);

  return { ok: true, plan, used: used + amount, limit, remaining: Math.max(0, limit - used - amount) };
}

/** Refund a previous successful charge (best-effort). */
export async function refund(
  caller: Caller,
  purpose: Purpose,
  amount = 1,
): Promise<void> {
  const date = utcDate();
  const doc = await loadUsage(caller.uid, date);
  doc.counters[purpose] = Math.max(0, (doc.counters[purpose] ?? 0) - amount);
  await saveUsage(doc);
}

/** Read current usage + limits for the caller (for the paywall UI). */
export async function getUsageSnapshot(caller: Caller): Promise<{
  plan: Plan;
  date: string;
  counters: Record<Purpose, { used: number; limit: number }>;
}> {
  const date = utcDate();
  const plan = await loadUserPlan(caller.uid);
  const doc = await loadUsage(caller.uid, date);
  const limits = PLAN_LIMITS[plan];
  const result: Record<string, { used: number; limit: number }> = {};
  for (const k of Object.keys(limits) as Purpose[]) {
    const limit = caller.provider === 'anonymous'
      ? Math.max(0, Math.floor(limits[k] * config.policy.anonymousMultiplier))
      : limits[k];
    result[k] = { used: doc.counters[k] ?? 0, limit };
  }
  return { plan, date, counters: result as Record<Purpose, { used: number; limit: number }> };
}

/** Upsert / update a user's plan (called by Stripe webhook in Phase 1). */
export async function setUserPlan(uid: string, plan: Plan, email?: string, provider?: string): Promise<void> {
  const doc: UserDoc = {
    id: uid,
    uid,
    type: 'user',
    plan,
    email,
    provider,
    updatedAt: new Date().toISOString(),
  };
  const cosmos = await getCosmos();
  if (!cosmos) {
    memUsers.set(uid, doc);
    return;
  }
  await cosmos.users.items.upsert<UserDoc>(doc);
}

function nextUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/** Test helper. */
export function _clearQuotaForTests(): void {
  memUsage.clear();
  memUsers.clear();
}
