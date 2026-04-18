import { describe, it, expect, beforeEach } from 'vitest';
import {
  charge,
  refund,
  getUsageSnapshot,
  setUserPlan,
  planForCaller,
  PLAN_LIMITS,
  _clearQuotaForTests,
} from '../src/lib/quota.js';
import type { Caller } from '../src/lib/auth.js';

const FREE_USER: Caller = {
  uid: 'ms:user-1',
  provider: 'microsoft',
  shortId: 'abc',
};

const ANON: Caller = {
  uid: 'anon:127001',
  provider: 'anonymous',
  shortId: 'anon',
};

describe('quota', () => {
  beforeEach(() => _clearQuotaForTests());

  it('starts at zero usage', async () => {
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.plan).toBe('free');
    expect(snap.counters.ocr.used).toBe(0);
    expect(snap.counters.ocr.limit).toBe(PLAN_LIMITS.free.ocr);
  });

  it('charges and increments counter on success', async () => {
    const r1 = await charge(FREE_USER, 'ocr');
    expect(r1.ok).toBe(true);
    expect(r1.ok && r1.used).toBe(1);
    const r2 = await charge(FREE_USER, 'ocr');
    expect(r2.ok && r2.used).toBe(2);
  });

  it('denies once daily limit is reached', async () => {
    const limit = PLAN_LIMITS.free['story-chapter']; // 1
    for (let i = 0; i < limit; i++) {
      const r = await charge(FREE_USER, 'story-chapter');
      expect(r.ok).toBe(true);
    }
    const denied = await charge(FREE_USER, 'story-chapter');
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.limit).toBe(limit);
      expect(denied.used).toBe(limit);
      expect(new Date(denied.retryAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('refunds restore quota', async () => {
    await charge(FREE_USER, 'ocr');
    await charge(FREE_USER, 'ocr');
    await refund(FREE_USER, 'ocr');
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.counters.ocr.used).toBe(1);
  });

  it('refund clamps at zero', async () => {
    await refund(FREE_USER, 'ocr', 5);
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.counters.ocr.used).toBe(0);
  });

  it('premium plan grants higher limits', async () => {
    await setUserPlan(FREE_USER.uid, 'premium');
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.plan).toBe('premium');
    expect(snap.counters['story-chapter'].limit).toBe(PLAN_LIMITS.premium['story-chapter']);
  });

  it('past_due plan reverts to free limits', async () => {
    await setUserPlan(FREE_USER.uid, 'past_due');
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.plan).toBe('past_due');
    expect(snap.counters.ocr.limit).toBe(PLAN_LIMITS.past_due.ocr);
    expect(PLAN_LIMITS.past_due.ocr).toBe(PLAN_LIMITS.free.ocr);
  });

  it('anonymous callers get a fraction of free limits', async () => {
    const snap = await getUsageSnapshot(ANON);
    // ANONYMOUS_DAILY_LIMIT_MULTIPLIER defaults to 0.5
    expect(snap.counters.ocr.limit).toBe(Math.floor(PLAN_LIMITS.free.ocr * 0.5));
  });

  it('amount > 1 is charged atomically and rejected if it would exceed', async () => {
    const r = await charge(FREE_USER, 'speech-minutes', PLAN_LIMITS.free['speech-minutes'] + 1);
    expect(r.ok).toBe(false);
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.counters['speech-minutes'].used).toBe(0);
  });

  it('different purposes have independent counters', async () => {
    await charge(FREE_USER, 'ocr');
    const snap = await getUsageSnapshot(FREE_USER);
    expect(snap.counters.ocr.used).toBe(1);
    expect(snap.counters.moments.used).toBe(0);
  });

  it('different users have isolated counters', async () => {
    const other: Caller = { uid: 'ms:user-2', provider: 'microsoft', shortId: 'xyz' };
    await charge(FREE_USER, 'ocr');
    const snap = await getUsageSnapshot(other);
    expect(snap.counters.ocr.used).toBe(0);
  });

  it('planForCaller normalises unknown values to free', () => {
    expect(planForCaller(undefined)).toBe('free');
    expect(planForCaller('mystery')).toBe('free');
    expect(planForCaller('premium')).toBe('premium');
    expect(planForCaller('trialing')).toBe('trialing');
  });
});
