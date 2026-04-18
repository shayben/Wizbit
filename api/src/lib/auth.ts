/**
 * Caller identity resolution.
 *
 * The browser app authenticates against Microsoft Entra (MSAL) or Google.
 * It sends the bearer token in the `Authorization` header and the provider
 * in `X-Auth-Provider` (`microsoft` | `google`). When neither header is
 * present, we fall back to anonymous mode (rate-limited by IP).
 *
 * Token verification:
 *  - Microsoft: validate ID/access tokens against Microsoft's JWKS using `jose`
 *  - Google:    call Google's tokeninfo endpoint (handles both id_token and
 *               access tokens; the existing client only has the access token)
 *
 * Verified identities are cached in-memory for the lifetime of the function
 * worker to keep p50 latency low.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';

export type Provider = 'microsoft' | 'google' | 'anonymous';

export interface Caller {
  uid: string;
  provider: Provider;
  email?: string;
  /** Stable, opaque identifier safe to log. */
  shortId: string;
}

/* ------------------------------------------------------------------------ */
/*  Microsoft Entra token verification                                       */
/* ------------------------------------------------------------------------ */

const msJwks = (() => {
  const tenant = config.auth.msTenantId;
  const url = `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
  // Lazy: jose creates the set lazily and caches keys.
  return createRemoteJWKSet(new URL(url), { cooldownDuration: 60_000 });
})();

interface CachedIdentity {
  caller: Caller;
  expiresAt: number;
}
const identityCache = new Map<string, CachedIdentity>();
const MAX_CACHE = 5_000;

function cacheGet(token: string): Caller | null {
  const hit = identityCache.get(token);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    identityCache.delete(token);
    return null;
  }
  return hit.caller;
}

function cachePut(token: string, caller: Caller, ttlMs: number): void {
  if (identityCache.size >= MAX_CACHE) {
    // Drop oldest ~10% on overflow
    const keys = Array.from(identityCache.keys()).slice(0, MAX_CACHE / 10);
    for (const k of keys) identityCache.delete(k);
  }
  identityCache.set(token, { caller, expiresAt: Date.now() + ttlMs });
}

async function verifyMicrosoft(token: string): Promise<Caller> {
  const { payload } = await jwtVerify(token, msJwks, {
    // Audience varies by app registration; we accept any audience but the
    // signing key + issuer must be Microsoft. (For B2B we'd pin the audience
    // to our app's client id once `AZURE_AD_CLIENT_ID` is configured server-side.)
    issuer: [
      `https://login.microsoftonline.com/${config.auth.msTenantId}/v2.0`,
      `https://sts.windows.net/${config.auth.msTenantId}/`,
    ],
  });
  // MSAL homeAccountId is `{oid}.{tid}` — match the client's uid format.
  const oid = String(payload.oid ?? payload.sub ?? '');
  const tid = String(payload.tid ?? config.auth.msTenantId);
  if (!oid) throw new Error('Microsoft token missing oid/sub claim');
  const uid = `${oid}.${tid}`;
  return {
    uid,
    provider: 'microsoft',
    email: typeof payload.preferred_username === 'string'
      ? payload.preferred_username
      : (typeof payload.email === 'string' ? payload.email : undefined),
    shortId: shortHash(uid),
  };
}

/* ------------------------------------------------------------------------ */
/*  Google token verification                                                */
/* ------------------------------------------------------------------------ */

interface GoogleTokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string | number;
  expires_in?: string | number;
  error_description?: string;
}

async function verifyGoogle(accessToken: string): Promise<{ caller: Caller; ttlMs: number }> {
  // Google's tokeninfo endpoint handles BOTH id_token and access_token.
  // The current Wizbit client uses access tokens (useGoogleLogin).
  const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Google tokeninfo rejected token (${res.status})`);
  }
  const info = (await res.json()) as GoogleTokenInfo;
  if (info.error_description) {
    throw new Error(`Google token invalid: ${info.error_description}`);
  }
  if (config.auth.googleClientId && info.aud && info.aud !== config.auth.googleClientId) {
    throw new Error('Google token audience mismatch');
  }
  if (!info.sub) throw new Error('Google token missing sub');
  const ttlSec = Number(info.expires_in ?? 300);
  const uid = `google:${info.sub}`;
  return {
    caller: {
      uid,
      provider: 'google',
      email: info.email,
      shortId: shortHash(uid),
    },
    ttlMs: Math.max(60, Math.min(ttlSec, 3600)) * 1000,
  };
}

/* ------------------------------------------------------------------------ */
/*  Public                                                                   */
/* ------------------------------------------------------------------------ */

export interface ResolveOptions {
  authHeader?: string | null;
  providerHeader?: string | null;
  ip?: string | null;
}

export async function resolveCaller(opts: ResolveOptions): Promise<Caller> {
  const auth = opts.authHeader ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const token = match?.[1];

  if (!token) {
    return anonymousCaller(opts.ip);
  }

  const cached = cacheGet(token);
  if (cached) return cached;

  const provider = (opts.providerHeader ?? '').toLowerCase();

  try {
    if (provider === 'google') {
      const { caller, ttlMs } = await verifyGoogle(token);
      cachePut(token, caller, ttlMs);
      return caller;
    }
    // Default: Microsoft
    const caller = await verifyMicrosoft(token);
    cachePut(token, caller, 5 * 60_000);
    return caller;
  } catch {
    return anonymousCaller(opts.ip);
  }
}

function anonymousCaller(ip?: string | null): Caller {
  const fingerprint = (ip ?? 'unknown').slice(0, 64);
  const uid = `anon:${shortHash(fingerprint)}`;
  return { uid, provider: 'anonymous', shortId: shortHash(uid) };
}

function shortHash(input: string): string {
  // Tiny, fast non-crypto hash — sufficient for log correlation only.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Test helper — clears the in-memory identity cache. */
export function _clearIdentityCacheForTests(): void {
  identityCache.clear();
}
