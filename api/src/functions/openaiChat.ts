/**
 * POST /api/openai/chat
 *
 * Generic Azure OpenAI chat-completions proxy. The `purpose` field selects
 * the rate-limit bucket — every server-side endpoint must declare which
 * monetised purpose it is contributing to.
 *
 * Request:
 *   {
 *     purpose: 'story-chapter' | 'moments' | 'translate-batch' | 'ocr-clean',
 *     messages: ChatCompletionMessage[],
 *     temperature?: number,
 *     max_tokens?: number,
 *     response_format?: 'text' | 'json_object'
 *   }
 *
 * Response: { content: string, usage?: {...} }
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { badRequest, ok, upstreamError } from '../lib/http.js';
import type { Purpose } from '../lib/quota.js';

type ClientPurpose = 'story-chapter' | 'moments' | 'translate-batch' | 'ocr-clean';

interface ChatBody {
  purpose?: ClientPurpose;
  messages?: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | 'json_object';
}

const PURPOSE_MAP: Record<ClientPurpose, Purpose> = {
  'story-chapter': 'story-chapter',
  moments: 'moments',
  'translate-batch': 'translate-batch',
  // OCR cleanup piggybacks on the OCR call itself (already charged) — bill 0.
  'ocr-clean': 'ocr',
};

const PURPOSE_AMOUNT: Record<ClientPurpose, number> = {
  'story-chapter': 1,
  moments: 1,
  'translate-batch': 1,
  'ocr-clean': 0,
};

const ALLOWED_TEMPS = (t: number | undefined) =>
  typeof t === 'number' && t >= 0 && t <= 2 ? t : 0.7;

const ALLOWED_TOKENS = (n: number | undefined) =>
  typeof n === 'number' && n > 0 && n <= 2000 ? Math.floor(n) : 800;

function pickHandler(purpose: ClientPurpose) {
  return guard(
    { purpose: PURPOSE_MAP[purpose], amount: PURPOSE_AMOUNT[purpose] },
    async (request: HttpRequest, _ctx: InvocationContext, { refundCharge }) => {
      const body = (await request.json().catch(() => null)) as ChatBody | null;
      if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        await refundCharge();
        return badRequest('messages[] required');
      }

      const endpoint = requireConfig(config.openai.endpoint, 'AZURE_OPENAI_ENDPOINT');
      const key = requireConfig(config.openai.key, 'AZURE_OPENAI_KEY');
      const deployment = config.openai.deployment;

      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`;
      const payload: Record<string, unknown> = {
        messages: body.messages,
        temperature: ALLOWED_TEMPS(body.temperature),
        max_tokens: ALLOWED_TOKENS(body.max_tokens),
      };
      if (body.response_format === 'json_object') {
        payload.response_format = { type: 'json_object' };
      }

      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        await refundCharge();
        return upstreamError(res.status, await res.text());
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: unknown;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      return ok({ content, usage: data.usage });
    },
  );
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === retries) return res;
    const retryAfter = Number(res.headers.get('Retry-After') || 0);
    const delay = Math.max(retryAfter * 1000, 1000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, delay));
  }
  // Unreachable but TS-required.
  return fetch(url, init);
}

// Single endpoint that dispatches based on body.purpose — keeps the HTTP
// surface narrow and allows future per-purpose throttling without new routes.
app.http('openai-chat', {
  route: 'openai/chat',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let purpose: ClientPurpose | undefined;
    try {
      const text = await request.clone().text();
      const parsed = JSON.parse(text) as ChatBody;
      purpose = parsed.purpose;
    } catch {
      return badRequest('Body must be JSON with a "purpose" field');
    }
    if (!purpose || !(purpose in PURPOSE_MAP)) {
      return badRequest(
        `purpose must be one of: ${Object.keys(PURPOSE_MAP).join(', ')}`,
      );
    }
    return pickHandler(purpose)(request, context);
  },
});
