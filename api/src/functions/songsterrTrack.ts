import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { badRequest, ok, upstreamError } from '../lib/http.js';
import { buildSongsterrAudioUrl } from '../lib/songsterr.js';

app.http('songsterrTrack', {
  route: 'songsterr/track',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const songId = Number.parseInt(request.query.get('songId') ?? '', 10);
    const trackIndex = Number.parseInt(request.query.get('trackIndex') ?? '0', 10);

    if (!Number.isInteger(songId) || songId <= 0) {
      return badRequest('Song ID is required.');
    }
    if (!Number.isInteger(trackIndex) || trackIndex < 0) {
      return badRequest('Track index must be a non-negative integer.');
    }

    try {
      const metaUrl = new URL(`https://www.songsterr.com/api/meta/${songId}`);
      metaUrl.searchParams.set('translateTo', 'en');

      const response = await fetch(metaUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return upstreamError(response.status, await response.text());
      }

      const meta = (await response.json()) as {
        revisionId?: number;
        audioV4?: string;
        title?: string;
        artist?: string;
        tracks?: Array<{ instrument?: string }>; 
      };

      const revisionId = Number(meta.revisionId);
      const audioV4 = typeof meta.audioV4 === 'string' ? meta.audioV4 : undefined;
      const tracks = Array.isArray(meta.tracks) ? meta.tracks : [];
      const safeTrackIndex = Math.min(trackIndex, Math.max(tracks.length - 1, 0));

      if (!Number.isInteger(revisionId) || revisionId <= 0 || !audioV4) {
        return upstreamError(404, 'This Songsterr song does not expose a playable audio version.');
      }

      const instrument = tracks[safeTrackIndex]?.instrument ?? 'Track';
      const trackName = tracks[safeTrackIndex]?.instrument ?? instrument;
      const audioUrl = buildSongsterrAudioUrl(songId, revisionId, audioV4, safeTrackIndex);

      return ok({
        songId,
        revisionId,
        trackIndex: safeTrackIndex,
        title: meta.title ?? 'Songsterr track',
        artist: meta.artist ?? 'Songsterr',
        instrument: trackName,
        audioUrl,
      });
    } catch (error) {
      console.error('Songsterr track resolution failed', error);
      return upstreamError(503, 'Songsterr playback is temporarily unavailable.');
    }
  },
});
