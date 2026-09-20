import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMidiInput } from '../hooks/useMidiInput';
import {
  DEMO_PIANO_SONG,
  evaluatePlayedNotes,
  midiNoteName,
  parseMidiFile,
  type PianoSong,
} from '../services/pianoSongService';
import PianoRoll from './PianoRoll';
import PianoSheetMusic from './PianoSheetMusic';
import SongsterrSearch from './SongsterrSearch';
import type { SongsterrSong, SongsterrTrack } from '../services/songsterrService';

interface PianoLearningProps {
  onClose: () => void;
}

export default function PianoLearning({ onClose }: PianoLearningProps) {
  const [song, setSong] = useState<PianoSong>(DEMO_PIANO_SONG);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState('Connect your keyboard, then play the highlighted note.');
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [pendingSongsterr, setPendingSongsterr] = useState<{
    song: SongsterrSong;
    track: SongsterrTrack;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSongsterrRef = useRef<{
    song: SongsterrSong;
    track: SongsterrTrack;
  } | null>(null);
  const releaseTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const advancingRef = useRef(false);

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

  useEffect(() => () => {
    releaseTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsLoadingFile(true);
    setFileError(null);
    try {
      const parsedSong = await parseMidiFile(file);
      const songsterrSelection = pendingSongsterrRef.current;
      const nextSong = songsterrSelection
        ? {
            ...parsedSong,
            id: `songsterr-${songsterrSelection.song.songId}-${parsedSong.id}`,
            title: `${songsterrSelection.song.artist} — ${songsterrSelection.song.title}`,
          }
        : parsedSong;
      setSong(nextSong);
      resetPractice(nextSong);
      pendingSongsterrRef.current = null;
      setPendingSongsterr(null);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read this MIDI file.');
    } finally {
      setIsLoadingFile(false);
    }
  }, [resetPractice]);

  const handleSongsterrPractice = useCallback((selectedSong: SongsterrSong, track: SongsterrTrack) => {
    const selection = { song: selectedSong, track };
    pendingSongsterrRef.current = selection;
    setPendingSongsterr(selection);
    setFileError(null);
    fileInputRef.current?.click();
  }, []);

  const handleLocalMidiUpload = useCallback(() => {
    pendingSongsterrRef.current = null;
    setPendingSongsterr(null);
    fileInputRef.current?.click();
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
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={onClose} className="text-violet-600 font-semibold mb-2">
              ← Home
            </button>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Piano Learning</h1>
            <p className="text-slate-500">USB MIDI wait mode with instant note-by-note feedback</p>
          </div>
          <button
            type="button"
            onClick={handleLocalMidiUpload}
            disabled={isLoadingFile}
            className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-200 disabled:opacity-60"
          >
            {isLoadingFile ? 'Reading MIDI…' : 'Upload any MIDI song'}
          </button>
        </header>

        {fileError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{fileError}</p>}
        {pendingSongsterr && (
          <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-700">
            Select an authorized MIDI file for {pendingSongsterr.song.artist} — {pendingSongsterr.song.title}
            {' '}({pendingSongsterr.track.instrument}).
          </p>
        )}

        <SongsterrSearch onPractice={handleSongsterrPractice} />

        <section className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-lg text-slate-900">{song.title}</h2>
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
        <PianoRoll chords={song.chords} currentIndex={currentIndex} pressedNotes={pressedNotes} />

        <p className="text-center text-xs text-slate-400">
          Connect the CT-X700 with a USB-B data cable, choose its MIDI port, and leave Local Control on to hear the keyboard.
        </p>
      </div>
    </div>
  );
}
