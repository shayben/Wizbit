import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { isOwnedLearnerScope, resolveCaller } from '../lib/auth.js';
import { badRequest, json, ok, serverError, unauthorized } from '../lib/http.js';
import {
  decodeMidiMetadata,
  encodeMidiMetadata,
  getMidiContainer,
  hasMidiHeader,
  isValidMidiId,
  midiBlobName,
  midiBlobPrefix,
} from '../lib/midiStorage.js';

const MAX_MIDI_BYTES = 5 * 1024 * 1024;
const MAX_LIBRARY_ITEMS = 100;
const MAX_LIBRARY_BYTES = 100 * 1024 * 1024;

function readHeader(request: HttpRequest, name: string, fallback: string): string {
  const raw = request.headers.get(name);
  if (!raw) return fallback;
  try {
    return decodeURIComponent(raw).trim().slice(0, 200) || fallback;
  } catch {
    return fallback;
  }
}

async function authenticate(request: HttpRequest, uid: string) {
  const caller = await resolveCaller({
    authHeader: request.headers.get('authorization'),
    providerHeader: request.headers.get('x-auth-provider'),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });
  return isOwnedLearnerScope(caller, uid) ? caller : null;
}

export async function midiLibraryHandler(
  request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const uid = request.query.get('uid')?.trim() ?? '';
  if (!uid || uid.length > 256) return badRequest('Invalid account scope');

  const caller = await authenticate(request, uid);
  if (!caller) return unauthorized();

  const container = await getMidiContainer();
  if (!container) {
    return json(503, { error: 'unavailable', message: 'MIDI library storage is not configured' });
  }

  const id = request.params.id?.trim() ?? '';
  if (id && !isValidMidiId(id)) return badRequest('Invalid MIDI id');

  try {
    if (request.method === 'GET' && !id) {
      const files = [];
      for await (const blob of container.listBlobsFlat({
        prefix: midiBlobPrefix(uid),
        includeMetadata: true,
      })) {
        if (files.length >= MAX_LIBRARY_ITEMS) break;
        const blobId = blob.name.slice(blob.name.lastIndexOf('/') + 1).replace(/\.mid$/i, '');
        if (!isValidMidiId(blobId)) continue;
        files.push({
          id: blobId,
          title: decodeMidiMetadata(blob.metadata?.title, 'Untitled MIDI'),
          fileName: decodeMidiMetadata(blob.metadata?.filename, `${blobId}.mid`),
          size: blob.properties.contentLength ?? 0,
          uploadedAt: blob.metadata?.uploadedat ?? blob.properties.createdOn?.toISOString() ?? '',
          updatedAt: blob.properties.lastModified?.toISOString() ?? '',
        });
      }
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return ok({ files });
    }

    if (!id) return badRequest('MIDI id is required');
    const blob = container.getBlockBlobClient(midiBlobName(uid, id));

    if (request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') ?? 0);
      if (contentLength > MAX_MIDI_BYTES) {
        return json(413, { error: 'file_too_large', message: 'MIDI files must be 5 MB or smaller' });
      }

      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIDI_BYTES) {
        return json(413, { error: 'file_too_large', message: 'MIDI files must be 5 MB or smaller' });
      }
      if (!hasMidiHeader(bytes)) return badRequest('File is not a Standard MIDI file');

      const now = new Date().toISOString();
      const title = readHeader(request, 'x-midi-title', 'Untitled MIDI');
      const fileName = readHeader(request, 'x-midi-filename', `${title}.mid`);
      const exists = await blob.exists();
      const existingProperties = exists ? await blob.getProperties() : null;
      let itemCount = 0;
      let totalBytes = 0;
      for await (const item of container.listBlobsFlat({ prefix: midiBlobPrefix(uid) })) {
        itemCount += 1;
        totalBytes += item.properties.contentLength ?? 0;
      }
      const nextTotalBytes = totalBytes
        - (existingProperties?.contentLength ?? 0)
        + bytes.byteLength;
      if (!exists && itemCount >= MAX_LIBRARY_ITEMS) {
        return json(409, {
          error: 'library_full',
          message: `Your MIDI library can contain up to ${MAX_LIBRARY_ITEMS} files`,
        });
      }
      if (nextTotalBytes > MAX_LIBRARY_BYTES) {
        return json(413, {
          error: 'library_full',
          message: 'Your MIDI library can store up to 100 MB',
        });
      }

      const uploadedAt = existingProperties?.metadata?.uploadedat ?? now;
      await blob.uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: 'audio/midi' },
        metadata: {
          title: encodeMidiMetadata(title),
          filename: encodeMidiMetadata(fileName),
          uploadedat: uploadedAt,
        },
      });
      return ok({ file: { id, title, fileName, size: bytes.byteLength, uploadedAt, updatedAt: now } });
    }

    if (request.method === 'GET') {
      const exists = await blob.exists();
      if (!exists) return json(404, { error: 'not_found', message: 'MIDI file not found' });
      const data = await blob.downloadToBuffer();
      return {
        status: 200,
        headers: {
          'Content-Type': 'audio/midi',
          'Cache-Control': 'private, max-age=300',
        },
        body: data,
      };
    }

    if (request.method === 'DELETE') {
      await blob.deleteIfExists();
      return ok({ ok: true });
    }

    return json(405, { error: 'method_not_allowed' });
  } catch (error) {
    console.error('MIDI library operation failed', {
      method: request.method,
      caller: caller.shortId,
      id: id || undefined,
      error,
    });
    return serverError('MIDI library operation failed');
  }
}

app.http('midiLibrary', {
  route: 'midi-library/{id?}',
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  handler: midiLibraryHandler,
});
