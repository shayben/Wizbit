/**
 * POST /api/openai/image
 *
 * Azure OpenAI image generation (DALL-E / gpt-image-1) proxy.
 * Premium-only; free tier returns 429 with an upsell payload.
 *
 * Request:  { prompt: string, size?: '1024x1024' | '512x512', quality?: 'low' | 'high' }
 * Response: { url?: string, b64_json?: string }
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { badRequest, ok, upstreamError } from '../lib/http.js';

interface ImageBody {
  prompt?: string;
  size?: '1024x1024' | '512x512';
  quality?: 'low' | 'high';
}

app.http('openai-image', {
  route: 'openai/image',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: guard(
    { purpose: 'sticker-image' },
    async (request: HttpRequest, _ctx: InvocationContext, { refundCharge }) => {
      const body = (await request.json().catch(() => null)) as ImageBody | null;
      if (!body?.prompt || body.prompt.length > 1000) {
        await refundCharge();
        return badRequest('prompt is required (max 1000 chars)');
      }

      const endpoint = requireConfig(config.openai.endpoint, 'AZURE_OPENAI_ENDPOINT');
      const key = requireConfig(config.openai.key, 'AZURE_OPENAI_KEY');
      const deployment = requireConfig(config.openai.dalleDeployment, 'AZURE_DALLE_DEPLOYMENT');

      const url = `${endpoint}/openai/deployments/${deployment}/images/generations?api-version=2025-04-01-preview`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Cute cartoon sticker for a children's reading app, flat design, simple shapes, bold outlines, vibrant colors, child-friendly: ${body.prompt}`,
          n: 1,
          size: body.size ?? '1024x1024',
          quality: body.quality ?? 'low',
          background: 'transparent',
          output_format: 'png',
        }),
      });

      if (!res.ok) {
        await refundCharge();
        return upstreamError(res.status, await res.text());
      }

      const data = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
      const item = data.data?.[0];
      return ok({ url: item?.url, b64_json: item?.b64_json });
    },
  ),
});
