import { useCallback, useState } from 'react';
import {
  getSongsterrUrl,
  searchSongsterr,
  type SongsterrSong,
  type SongsterrTrack,
} from '../services/songsterrService';

interface SongsterrSearchProps {
  onPractice: (song: SongsterrSong, track: SongsterrTrack) => void;
}

export default function SongsterrSearch({ onPractice }: SongsterrSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongsterrSong[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    try {
      setResults(await searchSongsterr(trimmed));
    } catch {
      setResults([]);
      setError('Songsterr search is unavailable right now. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Songsterr catalog</p>
          <h2 className="text-xl font-bold text-slate-900">Find a song to practice</h2>
          <p className="text-sm text-slate-500">Search Songsterr for piano and keyboard arrangements.</p>
        </div>
        <form onSubmit={handleSearch} className="flex w-full gap-2 md:w-auto">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Song or artist"
            aria-label="Search Songsterr"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-violet-500 md:w-72"
          />
          <button
            type="submit"
            disabled={query.trim().length < 2 || isSearching}
            className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {hasSearched && !isSearching && !error && results.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No Songsterr songs matched that search.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {results.slice(0, 10).map((song) => {
            const pianoTracks = song.tracks.filter((track) => track.isPiano);
            const suggestedTrack = pianoTracks[0] ?? song.tracks[song.defaultTrack] ?? song.tracks[0];
            return (
              <article key={song.songId} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-900">{song.title}</h3>
                <p className="text-sm text-slate-500">{song.artist}</p>
                <p className={`mt-2 text-xs font-semibold ${pianoTracks.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {pianoTracks.length
                    ? `${pianoTracks.length} piano/keyboard track${pianoTracks.length === 1 ? '' : 's'}`
                    : 'No dedicated piano track listed'}
                </p>
                {suggestedTrack && (
                  <p className="mt-1 truncate text-xs text-slate-400">{suggestedTrack.name}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={getSongsterrUrl(song, suggestedTrack?.index)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Open official tab ↗
                  </a>
                  {suggestedTrack && (
                    <button
                      type="button"
                      onClick={() => onPractice(song, suggestedTrack)}
                      className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Choose MIDI to practice
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Songsterr provides search and official tab links, but its public API does not provide note or MIDI downloads.
        Choose a MIDI file you are authorized to use to load the song into wait mode.
      </p>
    </section>
  );
}
