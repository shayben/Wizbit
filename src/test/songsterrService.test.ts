import { describe, expect, it } from 'vitest';
import { getSongsterrUrl, type SongsterrSong } from '../services/songsterrService';

const song: SongsterrSong = {
  songId: 206,
  artist: 'John Lennon',
  title: 'Imagine',
  defaultTrack: 1,
  tracks: [],
};

describe('songsterrService', () => {
  it('builds an official Songsterr track URL', () => {
    expect(getSongsterrUrl(song, 2)).toBe(
      'https://www.songsterr.com/a/wsa/john-lennon-imagine-tab-s206t2',
    );
  });

  it('uses the default track when no track is selected', () => {
    expect(getSongsterrUrl(song)).toContain('-s206t1');
  });
});
