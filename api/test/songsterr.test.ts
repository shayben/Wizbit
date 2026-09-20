import { describe, expect, it } from 'vitest';
import { mapSongsterrResults } from '../src/lib/songsterr.js';

describe('Songsterr result mapping', () => {
  it('keeps supported metadata and identifies piano tracks', () => {
    const songs = mapSongsterrResults([{
      songId: 206,
      artist: 'John Lennon',
      title: 'Imagine',
      defaultTrack: 1,
      tracks: [
        { instrumentId: 33, instrument: 'Electric Bass', name: 'Bass', views: 20 },
        { instrumentId: 0, instrument: 'Acoustic Grand Piano', name: 'Piano', views: 50, difficulty: 2 },
      ],
    }]);

    expect(songs).toEqual([{
      songId: 206,
      artist: 'John Lennon',
      title: 'Imagine',
      defaultTrack: 1,
      tracks: [
        {
          index: 0,
          name: 'Bass',
          instrument: 'Electric Bass',
          difficulty: null,
          views: 20,
          isPiano: false,
        },
        {
          index: 1,
          name: 'Piano',
          instrument: 'Acoustic Grand Piano',
          difficulty: 2,
          views: 50,
          isPiano: true,
        },
      ],
    }]);
  });

  it('drops junk and malformed entries', () => {
    expect(mapSongsterrResults([
      { songId: 1, artist: 'A', title: 'B', tracks: [], isJunk: true },
      { title: 'Missing fields' },
    ])).toEqual([]);
  });
});
