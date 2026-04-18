import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { resolveCaller, type Caller } from '../lib/auth.js';
import { getCosmosContainers } from '../lib/cosmos.js';
import { ok, badRequest, serverError } from '../lib/http.js';

interface WaitlistRequest {
  email: string;
  source?: string; // e.g. "paywall:story-chapter"
  metadata?: Record<string, unknown>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory fallback when Cosmos isn't configured (dev/test).
const memWaitlist = new Map<string, { email: string; createdAt: string; source?: string }>();

app.http('waitlist', {
  route: 'waitlist',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    let body: WaitlistRequest;
    try {
      body = (await request.json()) as WaitlistRequest;
    } catch {
      return badRequest('Invalid JSON body');
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return badRequest('Invalid email address');
    }

    const source = (body.source ?? 'unknown').slice(0, 64);
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

    let caller: Caller;
    try {
      caller = await resolveCaller({
        authHeader: request.headers.get('authorization'),
        providerHeader: request.headers.get('x-auth-provider'),
        ip,
      });
    } catch {
      caller = {
        uid: `anon:${ip ?? 'unknown'}`,
        provider: 'anonymous',
        shortId: 'anon',
      };
    }

    const doc = {
      id: email,
      uid: caller.uid,
      email,
      source,
      createdAt: new Date().toISOString(),
      provider: caller.provider,
    };

    try {
      const containers = await getCosmosContainers();
      if (containers?.waitlist) {
        await containers.waitlist.items.upsert(doc);
      } else {
        memWaitlist.set(email, { email, createdAt: doc.createdAt, source });
      }
      return ok({ ok: true });
    } catch (err) {
      console.error('waitlist persist failed', err);
      return serverError('Could not save your email. Please try again.');
    }
  },
});

export const _testing = { memWaitlist };
