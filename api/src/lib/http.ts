/**
 * Standardised JSON / error responses for the proxy functions.
 */

import type { HttpResponseInit } from '@azure/functions';

export function json(status: number, body: unknown, extraHeaders?: Record<string, string>): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
    jsonBody: body,
  };
}

export function ok<T>(body: T): HttpResponseInit {
  return json(200, body);
}

export function badRequest(message: string): HttpResponseInit {
  return json(400, { error: 'bad_request', message });
}

export function unauthorized(message = 'Sign in required'): HttpResponseInit {
  return json(401, { error: 'unauthorized', message });
}

export function quotaExceeded(detail: {
  purpose: string;
  limit: number;
  used: number;
  plan: string;
  retryAt: string;
}): HttpResponseInit {
  return json(
    429,
    {
      error: 'quota_exceeded',
      message: `You've used today's free magic for "${detail.purpose}". Upgrade for unlimited access.`,
      ...detail,
      upsell: {
        cta: 'Upgrade to Wizbit Premium',
        annualPrice: '$59/yr',
        monthlyPrice: '$7.99/mo',
      },
    },
    { 'Retry-After': '3600' },
  );
}

export function upstreamError(status: number, body: string): HttpResponseInit {
  return json(502, { error: 'upstream', upstreamStatus: status, body: body.slice(0, 500) });
}

export function serverError(message: string): HttpResponseInit {
  return json(500, { error: 'server_error', message });
}
