/**
 * POST /api/translate
 *
 * Azure Translator proxy — supports the existing two call patterns:
 *   1. Standalone word translation     (charges 'translate-word')
 *   2. Full text + alignment for in-context word lookup (charges 'translate-word')
 *
 * Batch translation (whole-text → word map) is handled by /api/openai/chat
 * with purpose:'translate-batch' — that path produces better polysemy results.
 *
 * Request:
 *   { text: string, to: string, includeAlignment?: boolean }
 *
 * Response: raw Translator JSON array.
 */

import { app, type HttpRequest } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { badRequest, ok, upstreamError } from '../lib/http.js';

interface TranslateBody {
  text?: string;
  to?: string;
  includeAlignment?: boolean;
}

app.http('translate', {
  route: 'translate',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: guard(
    { purpose: 'translate-word' },
    async (request: HttpRequest, _ctx, { refundCharge }) => {
      const body = (await request.json().catch(() => null)) as TranslateBody | null;
      if (!body?.text || !body.to) {
        await refundCharge();
        return badRequest('text and to are required');
      }
      // Cap text length — translator is per-character billed.
      if (body.text.length > 10_000) {
        await refundCharge();
        return badRequest('text exceeds 10000 characters');
      }

      const key = requireConfig(config.translator.key, 'AZURE_TRANSLATOR_KEY');
      const region = requireConfig(config.translator.region, 'AZURE_TRANSLATOR_REGION');

      const align = body.includeAlignment ? '&includeAlignment=true' : '';
      const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(body.to)}${align}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ Text: body.text }]),
      });

      if (!res.ok) {
        await refundCharge();
        return upstreamError(res.status, await res.text());
      }

      const data = await res.json();
      return ok(data);
    },
  ),
});
