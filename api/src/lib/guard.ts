/**
 * Request guard — resolves the caller, charges quota, and short-circuits
 * with a standardised error response if anything fails.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { resolveCaller, type Caller } from './auth.js';
import { charge, refund, type Purpose } from './quota.js';
import { quotaExceeded, unauthorized, serverError } from './http.js';
import { config } from './config.js';

export interface GuardedContext {
  caller: Caller;
  /** Roll back the quota charge — use on upstream failure. */
  refundCharge: () => Promise<void>;
}

export type GuardedHandler = (
  request: HttpRequest,
  context: InvocationContext,
  guard: GuardedContext,
) => Promise<HttpResponseInit>;

export interface GuardOptions {
  purpose: Purpose;
  amount?: number;
  /** When true, allow anonymous callers (subject to anon multiplier). */
  allowAnonymous?: boolean;
}

export function guard(opts: GuardOptions, handler: GuardedHandler) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('client-ip') ??
      null;

    const caller = await resolveCaller({
      authHeader: request.headers.get('authorization'),
      providerHeader: request.headers.get('x-auth-provider'),
      ip,
    });

    const allowAnon = opts.allowAnonymous ?? config.policy.allowAnonymous;
    if (caller.provider === 'anonymous' && !allowAnon) {
      return unauthorized();
    }

    const amount = opts.amount ?? 1;
    const result = await charge(caller, opts.purpose, amount);
    if (!result.ok) {
      context.log(`quota_denied ${caller.shortId} ${opts.purpose} used=${result.used}/${result.limit} plan=${result.plan}`);
      return quotaExceeded({
        purpose: opts.purpose,
        limit: result.limit,
        used: result.used,
        plan: result.plan,
        retryAt: result.retryAt,
      });
    }

    let refunded = false;
    const refundCharge = async () => {
      if (refunded) return;
      refunded = true;
      try {
        await refund(caller, opts.purpose, amount);
      } catch {
        /* best effort */
      }
    };

    try {
      return await handler(request, context, { caller, refundCharge });
    } catch (err) {
      await refundCharge();
      const message = err instanceof Error ? err.message : 'Unknown error';
      context.error(`handler_error ${caller.shortId} ${opts.purpose}: ${message}`);
      return serverError(message);
    }
  };
}
