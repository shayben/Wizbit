/**
 * GET /api/speech/token
 *
 * Issues a short-lived (10 min) Azure Speech authorization token so the
 * browser SDK can stream microphone audio to Azure Speech without ever
 * holding the long-lived speech key.
 *
 * Response: { token: string, region: string, expiresAt: string }
 *
 * Quota: 1 unit ≈ "permission to speak for ~1 minute".
 *        We charge 1 minute optimistically per token request — overshoot
 *        is acceptable, undershoot is the failure mode we cannot fix later.
 *        If you need finer accounting, the token fetch could be paired
 *        with a separate `/api/speech/finished` call that posts actual
 *        durationMs and refunds the difference.
 */

import { app, type HttpRequest } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { ok, upstreamError } from '../lib/http.js';

app.http('speech-token', {
  route: 'speech/token',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: guard(
    { purpose: 'speech-minutes', amount: 1 },
    async (_request: HttpRequest, _ctx, { refundCharge }) => {
      const key = requireConfig(config.speech.key, 'AZURE_SPEECH_KEY');
      const region = requireConfig(config.speech.region, 'AZURE_SPEECH_REGION');

      const url = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Length': '0',
        },
      });

      if (!res.ok) {
        await refundCharge();
        return upstreamError(res.status, await res.text());
      }

      const token = await res.text();
      // Azure tokens are valid for 10 minutes.
      const expiresAt = new Date(Date.now() + 9 * 60_000).toISOString();
      return ok({ token, region, expiresAt });
    },
  ),
});
