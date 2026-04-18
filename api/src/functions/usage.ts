/**
 * POST /api/usage  → returns the caller's quota snapshot.
 *
 * Used by the client to:
 *   - Render a "X of Y free chapters left today" hint
 *   - Pre-emptively show the upgrade screen before the user spends time
 *     on a feature that's about to be denied.
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { resolveCaller } from '../lib/auth.js';
import { getUsageSnapshot } from '../lib/quota.js';
import { ok } from '../lib/http.js';

app.http('usage', {
  route: 'usage',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const caller = await resolveCaller({
      authHeader: request.headers.get('authorization'),
      providerHeader: request.headers.get('x-auth-provider'),
      ip,
    });
    const snapshot = await getUsageSnapshot(caller);
    return ok({ provider: caller.provider, ...snapshot });
  },
});
