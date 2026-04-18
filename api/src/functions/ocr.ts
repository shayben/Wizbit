/**
 * POST /api/ocr/recognize
 *
 * Accepts a base64-encoded image (from the client camera), forwards it to
 * Azure Computer Vision Read API, and returns the raw response so the
 * client can keep its existing layout-extraction logic.
 *
 * Request:  { imageBase64: string, mimeType?: string }
 * Response: Azure Vision JSON, untouched.
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { badRequest, ok, upstreamError } from '../lib/http.js';

interface OcrBody {
  imageBase64?: string;
  mimeType?: string;
}

app.http('ocr-recognize', {
  route: 'ocr/recognize',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: guard(
    { purpose: 'ocr' },
    async (request: HttpRequest, _context: InvocationContext, { refundCharge }) => {
      const body = (await request.json().catch(() => null)) as OcrBody | null;
      if (!body?.imageBase64) {
        await refundCharge();
        return badRequest('imageBase64 is required');
      }

      const endpoint = requireConfig(config.vision.endpoint, 'AZURE_VISION_ENDPOINT');
      const key = requireConfig(config.vision.key, 'AZURE_VISION_KEY');
      const mime = body.mimeType ?? 'image/jpeg';

      const bytes = Buffer.from(body.imageBase64, 'base64');
      if (bytes.length > 4 * 1024 * 1024) {
        await refundCharge();
        return badRequest('Image exceeds 4 MB');
      }

      const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': mime,
        },
        body: bytes,
      });

      if (!res.ok) {
        await refundCharge();
        const text = await res.text();
        return upstreamError(res.status, text);
      }

      const data = await res.json();
      return ok(data);
    },
  ),
});
