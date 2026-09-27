import { useCallback, useEffect, useRef, useState } from 'react';
import {
  downloadOpenMidi,
  searchOpenMidiLibrary,
  type OpenMidiResult,
} from '../services/openMidiLibraryService';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';

interface OpenMidiSearchProps {
  savesToLibrary: boolean;
  onImport: (file: File) => Promise<void>;
  onVoiceSearchStart?: () => void;
}

type VoicePhase = 'idle' | 'recording' | 'transcribing';

function formatDuration(seconds: number | null) {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

export default function OpenMidiSearch({
  savesToLibrary,
  onImport,
  onVoiceSearchStart,
}: OpenMidiSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OpenMidiResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const recorderRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
    };
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    setIsSearching(true);
    setHasSearched(true);
    setError(null);
    try {
      setResults(await searchOpenMidiLibrary(trimmed));
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : 'Open MIDI search is unavailable.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearch = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    void performSearch(query);
  }, [performSearch, query]);

  const processRecording = useCallback(async (stopped: Promise<Blob>) => {
    try {
      const blob = await stopped;
      if (!mountedRef.current) return;
      if (blob.size < 200) throw new Error('I did not catch that. Please try again.');

      setVoicePhase('transcribing');
      const { text } = await transcribeAudio(blob);
      if (!mountedRef.current) return;
      if (!text) throw new Error('I did not catch that. Please try again.');

      setQuery(text);
      setVoicePhase('idle');
      await performSearch(text);
    } catch (voiceError) {
      if (!mountedRef.current || (voiceError instanceof Error && voiceError.message === 'cancelled')) return;
      setError(voiceError instanceof Error ? voiceError.message : 'Microphone search failed.');
      setVoicePhase('idle');
    } finally {
      recorderRef.current = null;
    }
  }, [performSearch]);

  const handleVoiceSearch = useCallback(async () => {
    if (voicePhase === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    if (voicePhase === 'transcribing') return;

    setError(null);
    setVoicePhase('recording');
    onVoiceSearchStart?.();
    try {
      const recorder = await recordAudioClip();
      if (!mountedRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = { stop: recorder.stop, cancel: recorder.cancel };
      void processRecording(recorder.stopped);
    } catch (voiceError) {
      if (!mountedRef.current) return;
      setError(voiceError instanceof Error ? voiceError.message : 'Microphone access was denied.');
      setVoicePhase('idle');
    }
  }, [onVoiceSearchStart, processRecording, voicePhase]);

  const handleImport = useCallback(async (result: OpenMidiResult) => {
    setImportingId(result.pageId);
    setError(null);
    try {
      await onImport(await downloadOpenMidi(result));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Could not import this MIDI.');
    } finally {
      setImportingId(null);
    }
  }, [onImport]);

  return (
    <section>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Open MIDI search</p>
        <h2 className="text-lg font-bold text-slate-900 md:text-xl">Find free music to practice</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search public-domain and CC0 MIDI files on Wikimedia Commons.
          {savesToLibrary ? ' Imports are saved to your online library.' : ' Sign in to save imports across devices.'}
        </p>
      </div>

      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Song or composer"
          aria-label="Search open MIDI library"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-violet-500"
        />
        <button
          type="button"
          onClick={() => void handleVoiceSearch()}
          disabled={voicePhase === 'transcribing'}
          aria-label={voicePhase === 'recording' ? 'Stop voice search recording' : 'Search by voice'}
          className={`grid size-11 shrink-0 place-items-center rounded-xl font-bold ${
            voicePhase === 'recording'
              ? 'animate-pulse bg-red-500 text-white'
              : 'bg-violet-100 text-violet-700 disabled:opacity-50'
          }`}
        >
          <span aria-hidden="true">{voicePhase === 'recording' ? '■' : voicePhase === 'transcribing' ? '…' : '🎤'}</span>
        </button>
        <button
          type="submit"
          disabled={query.trim().length < 2 || isSearching || voicePhase !== 'idle'}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {voicePhase === 'recording' && (
        <p className="mt-2 text-xs font-semibold text-red-600">Listening… say a song or composer, then tap stop.</p>
      )}
      {voicePhase === 'transcribing' && (
        <p className="mt-2 text-xs font-semibold text-violet-600">Turning speech into a search…</p>
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {hasSearched && !isSearching && !error && results.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No public-domain or CC0 MIDI files matched that search.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => (
            <article key={result.pageId} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <h3 className="line-clamp-2 font-bold text-slate-800">{result.title}</h3>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{result.artist}</p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                {result.license} · {formatSize(result.size)}
                {formatDuration(result.duration) && ` · ${formatDuration(result.duration)}`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleImport(result)}
                  disabled={importingId !== null}
                  className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {importingId === result.pageId
                    ? 'Importing…'
                    : savesToLibrary ? 'Add & practice' : 'Practice now'}
                </button>
                <a
                  href={result.descriptionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Source
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
