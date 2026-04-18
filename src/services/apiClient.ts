/**
 * Thin client for the Wizbit backend proxy (`/api/*`).
 *
 * Responsibilities:
 *   - Attach the active user's auth token (Microsoft / Google) to each request
 *   - Surface 429 quota errors as `QuotaExceededError` so the UI can react
 *   - Standard JSON / fetch ergonomics with 429-aware retry on idempotent calls
 *
 * Auth token retrieval is pluggable: `AuthContext` calls `setAuthTokenProvider(...)`
 * once it knows how to fetch a fresh token. Until then, calls are anonymous.
 */

export interface AuthTokenInfo {
  token: string;
  provider: 'microsoft' | 'google';
}

type TokenProvider = () => Promise<AuthTokenInfo | null>;

let tokenProvider: TokenProvider = async () => null;

export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

const API_BASE: string =
  // Vite-time override; defaults to same-origin "/api" so SWA managed Functions work.
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '/api';

export interface QuotaErrorPayload {
  error: 'quota_exceeded';
  purpose: string;
  limit: number;
  used: number;
  plan: string;
  retryAt: string;
  upsell: { cta: string; annualPrice: string; monthlyPrice: string };
}

export class QuotaExceededError extends Error {
  readonly payload: QuotaErrorPayload;
  constructor(payload: QuotaErrorPayload) {
    super(payload.purpose ? `Quota exceeded for ${payload.purpose}` : 'Quota exceeded');
    this.name = 'QuotaExceededError';
    this.payload = payload;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/* ------------------------------------------------------------------------ */
/*  Quota event bus — UI subscribes to show paywall                          */
/* ------------------------------------------------------------------------ */

type QuotaListener = (e: QuotaErrorPayload) => void;
const quotaListeners = new Set<QuotaListener>();

export function onQuotaExceeded(listener: QuotaListener): () => void {
  quotaListeners.add(listener);
  return () => quotaListeners.delete(listener);
}

function notifyQuota(payload: QuotaErrorPayload): void {
  for (const l of quotaListeners) {
    try { l(payload); } catch { /* swallow */ }
  }
}

/* ------------------------------------------------------------------------ */
/*  Core fetch                                                               */
/* ------------------------------------------------------------------------ */

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    const tok = await tokenProvider();
    if (tok?.token) {
      headers.set('Authorization', `Bearer ${tok.token}`);
      headers.set('X-Auth-Provider', tok.provider);
    }
  } catch {
    /* anonymous fallback */
  }
  return headers;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }

  if (res.status === 429 && body && typeof body === 'object' && (body as { error?: string }).error === 'quota_exceeded') {
    const payload = body as QuotaErrorPayload;
    notifyQuota(payload);
    throw new QuotaExceededError(payload);
  }
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export async function apiPost<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await buildHeaders(),
    body: JSON.stringify(body),
  });
  return parse<TRes>(res);
}

export async function apiGet<TRes>(path: string): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: await buildHeaders(),
  });
  return parse<TRes>(res);
}

/* ------------------------------------------------------------------------ */
/*  Convenience for raw blob uploads (e.g. images we already have as base64) */
/* ------------------------------------------------------------------------ */

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
