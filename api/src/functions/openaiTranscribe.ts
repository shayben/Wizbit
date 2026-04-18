/**
 * POST /api/openai/transcribe
 *
 * Audio transcription via Azure OpenAI Whisper. Used by the home-screen
 * "Ask" helper so a child can speak a word in either English or their
 * account language (or even code-switch within one utterance, e.g.
 * "how do you spell elephant in Hebrew") and get a single transcript
 * back without specifying the locale up front.
 *
 * Request:  { audioBase64: string, mimeType?: string, filename?: string }
 * Response: { text: string }
 */

import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { config, requireConfig } from '../lib/config.js';
import { guard } from '../lib/guard.js';
import { badRequest, ok, upstreamError } from '../lib/http.js';

/**
 * Whisper accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, oga, flac.
 * Browsers vary: Chrome/Edge → audio/webm;codecs=opus, Safari → audio/mp4,
 * Firefox → audio/ogg;codecs=opus. We strip codec parameters and pick a
 * filename extension Whisper recognises.
 */
function normaliseAudioMime(raw: string): { mime: string; ext: string } {
  const base = (raw.split(';')[0] ?? '').trim().toLowerCase() || 'audio/webm';
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/oga': 'oga',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/flac': 'flac',
  };
  const ext = map[base] ?? 'webm';
  return { mime: base, ext };
}

interface TranscribeBody {
  audioBase64?: string;
  mimeType?: string;
  filename?: string;
}

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // 8 MB upper bound — short clips only.

function buildMultipart(audio: Buffer, filename: string, mimeType: string): { body: Buffer; contentType: string } {
  const boundary = `----wizbit-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const CRLF = '\r\n';
  const head = Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
    `Content-Type: ${mimeType}${CRLF}${CRLF}`,
  );
  const between = Buffer.from(
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
    `whisper-1`,
  );
  const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
  return {
    body: Buffer.concat([head, audio, between, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

app.http('openai-transcribe', {
  route: 'openai/transcribe',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: guard(
    { purpose: 'transcribe' },
    async (request: HttpRequest, ctx: InvocationContext, { refundCharge }) => {
      const body = (await request.json().catch(() => null)) as TranscribeBody | null;
      if (!body?.audioBase64) {
        await refundCharge();
        return badRequest('audioBase64 is required');
      }

      const audio = Buffer.from(body.audioBase64, 'base64');
      if (audio.length === 0) {
        await refundCharge();
        return badRequest('audioBase64 decoded to empty payload');
      }
      if (audio.length > MAX_AUDIO_BYTES) {
        await refundCharge();
        return badRequest('Audio exceeds 8 MB');
      }

      const endpoint = requireConfig(
        config.openai.whisperEndpoint ?? config.openai.endpoint,
        'AZURE_OPENAI_WHISPER_ENDPOINT or AZURE_OPENAI_ENDPOINT',
      );
      const key = requireConfig(
        config.openai.whisperKey ?? config.openai.key,
        'AZURE_OPENAI_WHISPER_KEY or AZURE_OPENAI_KEY',
      );
      const deployment = requireConfig(
        config.openai.whisperDeployment,
        'AZURE_OPENAI_WHISPER_DEPLOYMENT',
      );

      const { mime, ext } = normaliseAudioMime(body.mimeType ?? 'audio/webm');
      const filename = body.filename ?? `clip.${ext}`;
      const { body: multipartBody, contentType } = buildMultipart(audio, filename, mime);

      const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/audio/transcriptions?api-version=2024-06-01`;
      ctx.log(`whisper upload bytes=${audio.length} mime=${mime} filename=${filename} url=${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': contentType },
        body: multipartBody,
      });

      if (!res.ok) {
        const errBody = await res.text();
        ctx.log(`whisper upstream error status=${res.status} body=${errBody.slice(0, 500)}`);
        await refundCharge();
        return upstreamError(res.status, errBody);
      }

      const data = (await res.json()) as { text?: string };
      return ok({ text: data.text ?? '' });
    },
  ),
});
