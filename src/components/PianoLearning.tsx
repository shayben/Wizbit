import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMidiInput } from '../hooks/useMidiInput';
import {
  BUILT_IN_PIANO_SONGS,
  DEMO_PIANO_SONG,
  evaluatePlayedNotes,
  midiNoteName,
  parseMidiFile,
  type PianoSong,
} from '../services/pianoSongService';
import type { SongsterrSong, SongsterrTrack } from '../services/songsterrService';
import PianoRoll from './PianoRoll';
import PianoSheetMusic from './PianoSheetMusic';
import SongsterrSearch from './SongsterrSearch';
import { usePianoSynth } from '../hooks/usePianoSynth';
import { useMicrophonePitch } from '../hooks/useMicrophonePitch';
import { useAuth } from '../contexts/AuthContext';
import {
  deleteMidiFile,
  listMidiFiles,
  loadMidiFile,
  saveMidiFile,
  type SavedMidiFile,
} from '../services/midiLibraryService';

interface PianoLearningProps {
  onClose: () => void;
}

type SongSourceTab = 'built-in' | 'library' | 'upload' | 'songsterr';

const COMPUTER_NOTE_KEYS: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PianoLearning({ onClose }: PianoLearningProps) {
  const { user } = useAuth();
  const [song, setSong] = useState<PianoSong>(DEMO_PIANO_SONG);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState('Play the highlighted note using the microphone, MIDI, or piano below.');
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [sourceTab, setSourceTab] = useState<SongSourceTab>('built-in');
  const [selectedSongsterr, setSelectedSongsterr] = useState<{ song: SongsterrSong; track: SongsterrTrack } | null>(null);
  const [midiLibrary, setMidiLibrary] = useState<SavedMidiFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(Boolean(user));
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [loadingLibraryId, setLoadingLibraryId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const releaseTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const advancingRef = useRef(false);
  const playTone = usePianoSynth();
  const libraryUid = user?.uid ?? null;

  const currentChord = song.chords[currentIndex];
  const expectedNotes = useMemo(
    () => currentChord?.notes.map((note) => note.midi) ?? [],
    [currentChord],
  );

  const resetPractice = useCallback((nextSong = song) => {
    setCurrentIndex(0);
    setPressedNotes(new Set());
    advancingRef.current = false;
    setCorrectCount(0);
    setMistakeCount(0);
    setFeedback(`Ready for ${nextSong.title}. Play ${nextSong.chords[0]?.notes.map((note) => note.name).join(' + ')}.`);
  }, [song]);

  const handleNoteOn = useCallback((note: number) => {
    setPressedNotes((previous) => {
      const next = new Set(previous);
      next.add(note);
      const result = evaluatePlayedNotes(expectedNotes, next);

      if (!expectedNotes.includes(note)) {
        setMistakeCount((count) => count + 1);
        setFeedback(`${midiNoteName(note)} is not in this chord. Try ${currentChord?.notes.map((item) => item.name).join(' + ')}.`);
      } else if (result.complete) {
        if (advancingRef.current) return next;
        advancingRef.current = true;
        setCorrectCount((count) => count + 1);
        setFeedback(result.exact ? 'Perfect!' : 'Correct notes found — keep going!');
        window.setTimeout(() => {
          setCurrentIndex((index) => {
            if (index >= song.chords.length - 1) {
              setFeedback('Song complete! Great playing.');
              return index;
            }
            return index + 1;
          });
          setPressedNotes(new Set());
          advancingRef.current = false;
        }, 180);
      } else {
        setFeedback(`Good — add ${result.missing.map(midiNoteName).join(' + ')}.`);
      }
      return next;
    });

    const existingTimer = releaseTimersRef.current.get(note);
    if (existingTimer) clearTimeout(existingTimer);
    releaseTimersRef.current.set(note, setTimeout(() => {
      setPressedNotes((previous) => {
        const next = new Set(previous);
        next.delete(note);
        return next;
      });
      releaseTimersRef.current.delete(note);
    }, 700));
  }, [currentChord, expectedNotes, song.chords.length]);

  const midi = useMidiInput(handleNoteOn);
  const microphone = useMicrophonePitch(handleNoteOn);
  const suppressMicrophone = microphone.suppress;
  const handlePlayableNote = useCallback((note: number) => {
    suppressMicrophone();
    playTone(note);
    handleNoteOn(note);
  }, [handleNoteOn, playTone, suppressMicrophone]);

  useEffect(() => () => {
    releaseTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || target?.matches('input, textarea, select, button, a')) return;
      const note = COMPUTER_NOTE_KEYS[event.key.toLowerCase()];
      if (note === undefined) return;
      event.preventDefault();
      handlePlayableNote(note);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayableNote]);

  useEffect(() => {
    if (!libraryUid) {
      setMidiLibrary([]); // eslint-disable-line react-hooks/set-state-in-effect
      setLibraryLoading(false);
      return;
    }

    let cancelled = false;
    setLibraryLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setLibraryError(null);
    listMidiFiles(libraryUid)
      .then((files) => {
        if (!cancelled) setMidiLibrary(files);
      })
      .catch(() => {
        if (!cancelled) setLibraryError('Could not load your online MIDI library. Storage may not be configured yet.');
      })
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });
    return () => { cancelled = true; };
  }, [libraryUid]);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsLoadingFile(true);
    setFileError(null);
    setLibraryError(null);
    try {
      const parsedSong = await parseMidiFile(file);
      setSelectedSongsterr(null);
      setSong(parsedSong);
      resetPractice(parsedSong);

      if (libraryUid) {
        try {
          const saved = await saveMidiFile(libraryUid, file, parsedSong.title);
          setMidiLibrary((previous) => [
            saved,
            ...previous.filter((item) => item.id !== saved.id),
          ]);
          setFeedback(`Saved ${parsedSong.title} to your online MIDI library.`);
        } catch {
          setLibraryError(`${parsedSong.title} is ready now, but could not be saved online.`);
        }
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read this MIDI file.');
    } finally {
      setIsLoadingFile(false);
    }
  }, [libraryUid, resetPractice]);

  const handleLocalMidiUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleBuiltInSong = useCallback((nextSong: PianoSong) => {
    setSelectedSongsterr(null);
    setSong(nextSong);
    resetPractice(nextSong);
  }, [resetPractice]);

  const handleLibrarySong = useCallback(async (saved: SavedMidiFile) => {
    if (!libraryUid) return;
    setLoadingLibraryId(saved.id);
    setLibraryError(null);
    try {
      const file = await loadMidiFile(libraryUid, saved);
      const parsedSong = await parseMidiFile(file);
      setSelectedSongsterr(null);
      setSong(parsedSong);
      resetPractice(parsedSong);
    } catch {
      setLibraryError(`Could not load ${saved.title} from your online library.`);
    } finally {
      setLoadingLibraryId(null);
    }
  }, [libraryUid, resetPractice]);

  const handleDeleteLibrarySong = useCallback(async (saved: SavedMidiFile) => {
    if (!libraryUid || !window.confirm(`Remove "${saved.title}" from your online MIDI library?`)) return;
    setLibraryError(null);
    try {
      await deleteMidiFile(libraryUid, saved.id);
      setMidiLibrary((previous) => previous.filter((item) => item.id !== saved.id));
    } catch {
      setLibraryError(`Could not remove ${saved.title}.`);
    }
  }, [libraryUid]);

  const handleRefreshLibrary = useCallback(async () => {
    if (!libraryUid) return;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      setMidiLibrary(await listMidiFiles(libraryUid));
    } catch {
      setLibraryError('Could not refresh your online MIDI library.');
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryUid]);

  const handleSongsterrPractice = useCallback((song: SongsterrSong, track: SongsterrTrack) => {
    setSelectedSongsterr({ song, track });
    setSourceTab('upload');
    setFileError(null);
    setFeedback(`Selected ${song.title} from Songsterr — upload your authorized MIDI file for ${track.name} to practice.`);
  }, []);

  const progress = song.chords.length === 0 ? 0 : ((currentIndex + 1) / song.chords.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-pink-50 p-4 md:p-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="hidden"
        onChange={handleFile}
      />
      <div className="max-w-6xl mx-auto space-y-5">
        <header>
          <div>
            <button type="button" onClick={onClose} className="text-violet-600 font-semibold mb-2">
              ← Home
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Piano Learning</h1>
            <p className="text-slate-500">Play with your microphone, USB MIDI, the on-screen piano, or computer keys</p>
          </div>
        </header>

        {fileError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{fileError}</p>}
        {libraryError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{libraryError}</p>}
        {selectedSongsterr && (
          <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
            Selected from Songsterr: <span className="font-semibold">{selectedSongsterr.song.title}</span> by{' '}
            {selectedSongsterr.song.artist} · {selectedSongsterr.track.name}. Upload an authorized MIDI file to practice.
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div
            role="tablist"
            aria-label="Choose a song source"
            className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {([
              { id: 'built-in', label: 'Built-in', icon: '🎼' },
              { id: 'library', label: 'Library', icon: '☁️' },
              { id: 'upload', label: 'Upload', icon: '📁' },
              { id: 'songsterr', label: 'Songsterr', icon: '🎸' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sourceTab === tab.id}
                onClick={() => setSourceTab(tab.id)}
                className={`min-w-0 rounded-lg px-2 py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                  sourceTab === tab.id
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="mr-1" aria-hidden="true">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {sourceTab === 'built-in' && (
            <div className="mt-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Built-in lessons</p>
                <h2 className="text-lg font-bold text-slate-900 md:text-xl">Public-domain songs</h2>
              </div>
              <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5">
                {BUILT_IN_PIANO_SONGS.map((builtInSong) => (
                  <button
                    key={builtInSong.id}
                    type="button"
                    onClick={() => handleBuiltInSong(builtInSong)}
                    className={`min-w-[75%] snap-start rounded-xl border p-3 text-left transition-colors sm:min-w-0 ${
                      song.id === builtInSong.id
                        ? 'border-violet-500 bg-white ring-2 ring-violet-200'
                        : 'border-violet-100 bg-violet-50/50 hover:border-violet-300'
                    }`}
                  >
                    <span className="block font-bold text-slate-800">{builtInSong.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{builtInSong.credit}</span>
                    <span className="mt-2 block text-xs font-semibold text-violet-600">
                      {builtInSong.notes.length} notes · {builtInSong.bpm} BPM
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sourceTab === 'library' && (
            <div className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Online MIDI library</p>
                  <h2 className="text-lg font-bold text-slate-900 md:text-xl">Your uploaded songs</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {libraryUid
                      ? 'Available on every device where you sign in to this account.'
                      : 'Sign in from the home screen to save MIDI files and use them across devices.'}
                  </p>
                </div>
                {libraryUid && (
                  <button
                    type="button"
                    onClick={handleRefreshLibrary}
                    disabled={libraryLoading}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60"
                  >
                    {libraryLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                )}
              </div>

              {libraryUid && libraryLoading && (
                <p className="mt-4 text-sm text-slate-500">Loading your MIDI library…</p>
              )}
              {libraryUid && !libraryLoading && midiLibrary.length === 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50 p-5 text-center">
                  <p className="font-semibold text-slate-700">No saved MIDI files yet</p>
                  <button
                    type="button"
                    onClick={() => setSourceTab('upload')}
                    className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white"
                  >
                    Upload your first MIDI
                  </button>
                </div>
              )}
              {libraryUid && midiLibrary.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {midiLibrary.map((saved) => (
                    <article key={saved.id} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                      <button
                        type="button"
                        onClick={() => handleLibrarySong(saved)}
                        disabled={loadingLibraryId !== null}
                        className="w-full text-left disabled:opacity-60"
                      >
                        <span className="block truncate font-bold text-slate-800">{saved.title}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{saved.fileName}</span>
                        <span className="mt-2 block text-xs font-semibold text-violet-600">
                          {loadingLibraryId === saved.id ? 'Loading…' : `${formatFileSize(saved.size)} · Play`}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLibrarySong(saved)}
                        className="mt-3 text-xs font-semibold text-red-500"
                      >
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {sourceTab === 'upload' && (
            <div className="mt-4 rounded-xl bg-violet-50 p-5 text-center">
              <div className="text-4xl" aria-hidden="true">🎵</div>
              <h2 className="mt-2 text-lg font-bold text-slate-900">Practice your own MIDI file</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
                Import a Standard MIDI file to generate the sheet view, falling notes, and wait-mode targets.
                {libraryUid
                  ? ' It will also be saved to your online library.'
                  : ' Sign in from the home screen to save it across devices.'}
                {selectedSongsterr && ' Use the Songsterr selection above to find the song and pair it with an authorized MIDI file.'}
              </p>
              <button
                type="button"
                onClick={handleLocalMidiUpload}
                disabled={isLoadingFile}
                className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-200 disabled:opacity-60 sm:w-auto"
              >
                {isLoadingFile ? 'Reading and saving…' : libraryUid ? 'Choose and save MIDI' : 'Choose MIDI file'}
              </button>
            </div>
          )}

          {sourceTab === 'songsterr' && (
            <div className="mt-4">
              <SongsterrSearch onPractice={handleSongsterrPractice} />
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_18rem_18rem]">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-lg text-slate-900">{song.title}</h2>
                {song.credit && <p className="text-xs text-slate-400">{song.credit}</p>}
                <p className="text-sm text-slate-500">
                  {song.bpm} BPM · {song.notes.length} notes · target {currentIndex + 1}/{song.chords.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => resetPractice()}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Restart
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-4 text-white min-w-72">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">USB MIDI keyboard</p>
                <p className="font-semibold" aria-live="polite">
                  {midi.status === 'connected'
                    ? midi.devices.find((device) => device.id === midi.selectedDeviceId)?.name
                    : midi.isSupported ? 'Keyboard not connected' : 'Not supported on this device'}
                </p>
              </div>
              {midi.isSupported && (
                <button
                  type="button"
                  onClick={midi.connect}
                  disabled={midi.status === 'connecting'}
                  className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-60"
                >
                  {midi.status === 'connecting' ? 'Connecting…' : midi.status === 'connected' ? 'Refresh' : 'Connect'}
                </button>
              )}
            </div>
            {midi.devices.length > 1 && (
              <select
                value={midi.selectedDeviceId}
                onChange={(event) => midi.selectDevice(event.target.value)}
                className="mt-3 w-full rounded-lg bg-slate-800 p-2 text-sm"
              >
                {midi.devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name}</option>
                ))}
              </select>
            )}
            {midi.error && (
              <p className={`mt-2 text-xs ${midi.status === 'unsupported' ? 'text-slate-300' : 'text-amber-300'}`}>
                {midi.error}
              </p>
            )}
          </div>

          <div className="min-w-72 rounded-2xl bg-emerald-950 p-4 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-300">Microphone</p>
                <p className="font-semibold">
                  {microphone.status === 'listening'
                    ? microphone.detectedMidi === null
                      ? 'Listening for a note…'
                      : `Heard ${midiNoteName(microphone.detectedMidi)}`
                    : microphone.isSupported ? 'Acoustic piano input' : 'Not supported'}
                </p>
              </div>
              {microphone.isSupported && (
                <button
                  type="button"
                  onClick={microphone.status === 'listening' ? microphone.stop : microphone.start}
                  disabled={microphone.status === 'requesting'}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 disabled:opacity-60"
                >
                  {microphone.status === 'requesting'
                    ? 'Allow…'
                    : microphone.status === 'listening' ? 'Stop' : 'Listen'}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-emerald-200">
              Best for one note at a time. Play clearly and reduce background noise.
            </p>
            {microphone.error && <p className="mt-2 text-xs text-amber-300">{microphone.error}</p>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className={`rounded-2xl border p-4 ${
            feedback === 'Perfect!' ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-violet-100'
          }`}>
            <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Wait mode</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{feedback}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentChord?.notes.map((note) => (
                <span
                  key={note.id}
                  className={`rounded-xl px-4 py-2 text-xl font-bold ${
                    pressedNotes.has(note.midi)
                      ? 'bg-emerald-500 text-white'
                      : note.hand === 'left' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                  }`}
                >
                  {note.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="min-w-24 rounded-2xl bg-emerald-50 p-4 text-center border border-emerald-100">
              <p className="text-2xl font-bold text-emerald-700">{correctCount}</p>
              <p className="text-xs font-semibold text-emerald-600">Correct</p>
            </div>
            <div className="min-w-24 rounded-2xl bg-amber-50 p-4 text-center border border-amber-100">
              <p className="text-2xl font-bold text-amber-700">{mistakeCount}</p>
              <p className="text-xs font-semibold text-amber-600">Retries</p>
            </div>
          </div>
        </section>

        <PianoSheetMusic chords={song.chords} currentIndex={currentIndex} />
        <PianoRoll
          chords={song.chords}
          currentIndex={currentIndex}
          pressedNotes={pressedNotes}
          onPlayNote={handlePlayableNote}
        />

        <p className="text-center text-xs text-slate-400">
          On iPhone or iPad, tap Listen to use the microphone. You can also tap the piano keys or use
          A W S E D F T G Y H U J K. For the CT-X700, connect a USB-B data cable and leave Local Control on.
        </p>
      </div>
    </div>
  );
}
