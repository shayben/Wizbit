import type { HttpRequest, InvocationContext } from '@azure/functions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCaller } from '../src/lib/auth.js';
import { config } from '../src/lib/config.js';
import { guard } from '../src/lib/guard.js';
import { charge, refund } from '../src/lib/quota.js';

vi.mock('../src/lib/auth.js', () => ({
  resolveCaller: vi.fn(),
}));

vi.mock('../src/lib/quota.js', () => ({
  charge: vi.fn(),
  refund: vi.fn(),
}));

const caller = {
  uid: 'ms:user-1',
  provider: 'microsoft' as const,
  shortId: 'abc',
};

const request = {
  headers: new Headers(),
} as unknown as HttpRequest;

const context = {
  log: vi.fn(),
  error: vi.fn(),
} as unknown as InvocationContext;

describe('guard freemium switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCaller).mockResolvedValue(caller);
    config.policy.freemiumEnabled = false;
  });

  it('bypasses quota charging when freemium is disabled', async () => {
    const handler = vi.fn(async (
      _request: HttpRequest,
      _context: InvocationContext,
      { refundCharge }: { refundCharge: () => Promise<void> },
    ) => {
      await refundCharge();
      return { status: 200 };
    });

    const response = await guard({ purpose: 'ocr' }, handler)(request, context);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    expect(charge).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it('enforces quota limits when freemium is enabled', async () => {
    config.policy.freemiumEnabled = true;
    vi.mocked(charge).mockResolvedValue({
      ok: false,
      plan: 'free',
      used: 3,
      limit: 3,
      retryAt: '2026-09-04T00:00:00.000Z',
    });
    const handler = vi.fn(async () => ({ status: 200 }));

    const response = await guard({ purpose: 'ocr' }, handler)(request, context);

    expect(response.status).toBe(429);
    expect(charge).toHaveBeenCalledWith(caller, 'ocr', 1);
    expect(handler).not.toHaveBeenCalled();
  });
});
