import { describe, expect, it } from 'vitest';
import { isAdminEmail } from '../src/lib/auth.js';

describe('admin identity', () => {
  it('matches configured admin emails case-insensitively', () => {
    expect(isAdminEmail(' Admin@Example.com ', ['admin@example.com'])).toBe(true);
  });

  it('does not grant admin access to unconfigured or missing emails', () => {
    expect(isAdminEmail('other@example.com', ['admin@example.com'])).toBe(false);
    expect(isAdminEmail(undefined, ['admin@example.com'])).toBe(false);
  });
});
