import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { badRequest, ok, upstreamError } from '../lib/http.js';
import { mapSongsterrResults } from '../lib/songsterr.js';

app.http('songsterrSearch', {
  route: 'songsterr/search',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const query = (request.query.get('q') ?? '').trim();
    if (query.length < 2 || query.length > 80) {
      return badRequest('Search query must be between 2 and 80 characters.');
    }

    const url = new URL('https://www.songsterr.com/api/songs');
    url.searchParams.set('pattern', query);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return upstreamError(response.status, await response.text());
      }

      const songs = mapSongsterrResults(await response.json());
      return ok({ songs });
    } catch (error) {
      console.error('Songsterr search failed', error);
      return upstreamError(503, 'Songsterr search is temporarily unavailable.');
    }
  },
});
