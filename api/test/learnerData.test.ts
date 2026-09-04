import { describe, expect, it } from 'vitest';
import type { Caller } from '../src/lib/auth.js';
import { isOwnedLearnerScope } from '../src/functions/learnerData.js';

function caller(uid: string, provider: Caller['provider'] = 'google'): Caller {
  return { uid, provider, shortId: 'test' };
}

describe('learner data ownership', () => {
  it('allows an authenticated account to access its account-level data', () => {
    expect(isOwnedLearnerScope(caller('account-a'), 'account-a')).toBe(true);
  });

  it('allows an authenticated account to access its learner profiles', () => {
    expect(isOwnedLearnerScope(caller('account-a'), 'account-a::profile-1')).toBe(true);
  });

  it('isolates accounts and similarly-prefixed account ids', () => {
    expect(isOwnedLearnerScope(caller('account-a'), 'account-b::profile-1')).toBe(false);
    expect(isOwnedLearnerScope(caller('account-a'), 'account-ab::profile-1')).toBe(false);
  });

  it('never persists anonymous learner data', () => {
    expect(isOwnedLearnerScope(caller('anon:test', 'anonymous'), 'anon:test')).toBe(false);
  });
});
