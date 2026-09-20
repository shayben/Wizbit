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

interface PianoLearningProps {
  onClose: () => void;
}

type SongSourceTab = 'built-in' | 'upload' | 'songsterr';

const COMPUTER_NOTE_KEYS: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

export default function PianoLearning({ onClose }: PianoLearningProps) {
  const [song, setSong] = useState<PianoSong>(DEMO_PIANO_SONG);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState('Connect your keyboard, then play the highlighted note.');
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [sourceTab, setSourceTab] = useState<SongSourceTab>('built-in');
  const [selectedSongsterr, setSelectedSongsterr] = useState<{ song: SongsterrSong; track: SongsterrTrack } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const releaseTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const advancingRef = useRef(false);
  const playTone = usePianoSynth();

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
  const handlePlayableNote = useCallback((note: number) => {
    playTone(note);
    handleNoteOn(note);
  }, [handleNoteOn, playTone]);

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

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsLoadingFile(true);
    setFileError(null);
    try {
      const parsedSong = await parseMidiFile(file);
      setSelectedSongsterr(null);
      setSong(parsedSong);
      resetPractice(parsedSong);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read this MIDI file.');
    } finally {
      setIsLoadingFile(false);
    }
  }, [resetPractice]);

  const handleLocalMidiUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleBuiltInSong = useCallback((nextSong: PianoSong) => {
    setSelectedSongsterr(null);
    setSong(nextSong);
    resetPractice(nextSong);
  }, [resetPractice]);

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
            <p className="text-slate-500">Play with USB MIDI, the on-screen piano, or your computer keyboard</p>
          </div>
        </header>

        {fileError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{fileError}</p>}
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
            className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
          >
            {([
              { id: 'built-in', label: 'Built-in', icon: '🎼' },
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

          {sourceTab === 'upload' && (
            <div className="mt-4 rounded-xl bg-violet-50 p-5 text-center">
              <div className="text-4xl" aria-hidden="true">🎵</div>
              <h2 className="mt-2 text-lg font-bold text-slate-900">Practice your own MIDI file</h2>
              <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
                Import a Standard MIDI file to generate the sheet view, falling notes, and wait-mode targets.
                {selectedSongsterr && ' Use the Songsterr selection above to find the song and pair it with an authorized MIDI file.'}
              </p>
              <button
                type="button"
                onClick={handleLocalMidiUpload}
                disabled={isLoadingFile}
                className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-200 disabled:opacity-60 sm:w-auto"
              >
                {isLoadingFile ? 'Reading MIDI…' : 'Choose MIDI file'}
              </button>
            </div>
          )}

          {sourceTab === 'songsterr' && (
            <div className="mt-4">
              <SongsterrSearch onPractice={handleSongsterrPractice} />
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
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
                <p className="text-xs uppercase tracking-wider text-slate-400">USB MIDI</p>
                <p className="font-semibold">
                  {midi.status === 'connected'
                    ? midi.devices.find((device) => device.id === midi.selectedDeviceId)?.name
                    : 'Keyboard not connected'}
                </p>
              </div>
              <button
                type="button"
                onClick={midi.connect}
                disabled={midi.status === 'connecting'}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                {midi.status === 'connecting' ? 'Connecting…' : midi.status === 'connected' ? 'Refresh' : 'Connect'}
              </button>
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
            {midi.error && <p className="mt-2 text-xs text-amber-300">{midi.error}</p>}
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
          No keyboard required: tap the piano keys or use A W S E D F T G Y H U J K. For the CT-X700,
          connect a USB-B data cable and leave Local Control on.
        </p>
      </div>
    </div>
  );
}
