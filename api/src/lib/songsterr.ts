export interface SongsterrTrack {
  index: number;
  name: string;
  instrument: string;
  difficulty: number | null;
  views: number;
  isPiano: boolean;
}

export interface SongsterrSong {
  songId: number;
  artist: string;
  title: string;
  defaultTrack: number;
  tracks: SongsterrTrack[];
}

interface SongsterrApiTrack {
  instrumentId?: number;
  instrument?: string;
  views?: number;
  name?: string;
  difficulty?: number;
}

interface SongsterrApiSong {
  songId?: number;
  artist?: string;
  title?: string;
  defaultTrack?: number;
  isJunk?: boolean;
  tracks?: SongsterrApiTrack[];
}

export function mapSongsterrResults(value: unknown): SongsterrSong[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): SongsterrSong[] => {
    const song = candidate as SongsterrApiSong;
    if (
      song.isJunk
      || !Number.isInteger(song.songId)
      || typeof song.artist !== 'string'
      || typeof song.title !== 'string'
      || !Array.isArray(song.tracks)
    ) {
      return [];
    }

    const tracks = song.tracks.map((track, index) => {
      const instrument = typeof track.instrument === 'string' ? track.instrument : 'Unknown instrument';
      const name = typeof track.name === 'string' && track.name.trim() ? track.name.trim() : instrument;
      return {
        index,
        name,
        instrument,
        difficulty: typeof track.difficulty === 'number' ? track.difficulty : null,
        views: typeof track.views === 'number' ? track.views : 0,
        isPiano: track.instrumentId === 0 || /piano|keyboard|organ/i.test(`${instrument} ${name}`),
      };
    });

    return [{
      songId: song.songId!,
      artist: song.artist.trim(),
      title: song.title.trim(),
      defaultTrack: typeof song.defaultTrack === 'number' ? song.defaultTrack : 0,
      tracks,
    }];
  });
}
