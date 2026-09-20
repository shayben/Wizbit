import { apiGet } from './apiClient';

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

interface SongsterrSearchResponse {
  songs: SongsterrSong[];
}

export async function searchSongsterr(query: string): Promise<SongsterrSong[]> {
  const response = await apiGet<SongsterrSearchResponse>(
    `/songsterr/search?q=${encodeURIComponent(query.trim())}`,
  );
  return response.songs;
}

export function getSongsterrUrl(song: SongsterrSong, trackIndex?: number): string {
  const slug = `${song.artist}-${song.title}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const selectedTrack = trackIndex ?? song.defaultTrack;
  return `https://www.songsterr.com/a/wsa/${slug}-tab-s${song.songId}t${selectedTrack}`;
}
