import { afterEach, describe, expect, it } from 'vitest';
import { isAdminCaller } from '../src/lib/auth.js';
import { config } from '../src/lib/config.js';

describe('admin identity', () => {
  afterEach(() => {
    config.auth.adminEmails.clear();
  });

  it('grants admin access to the default admin accounts', () => {
    for (const email of [
      'Shaybenelazar@hotmail.com',
      'Shay.benel@gmail.com',
      'Shbenela@microsoft.com',
    ]) {
      expect(isAdminCaller({
        uid: `user:${email}`,
        provider: 'microsoft',
        email,
        shortId: 'admin',
      })).toBe(true);
    }
  });

  it('grants admin access to default admin UIDs without an email claim', () => {
    expect(isAdminCaller({
      uid: 'google:114788041842846489858',
      provider: 'google',
      shortId: 'admin',
    })).toBe(true);
  });

  it('matches configured admin emails case-insensitively', () => {
    config.auth.adminEmails.add('admin@example.com');
    expect(isAdminCaller({
      uid: 'ms:admin-1',
      provider: 'microsoft',
      email: 'Admin@Example.com',
      shortId: 'admin',
    })).toBe(true);
  });

  it('does not grant admin access to unconfigured or missing emails', () => {
    config.auth.adminEmails.add('admin@example.com');
    expect(isAdminCaller({
      uid: 'ms:user-1',
      provider: 'microsoft',
      email: 'other@example.com',
      shortId: 'user',
    })).toBe(false);
  });
});
