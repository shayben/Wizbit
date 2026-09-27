import { Midi } from '@tonejs/midi';

export interface PianoNote {
  id: string;
  midi: number;
  name: string;
  time: number;
  duration: number;
  velocity: number;
  hand: 'left' | 'right';
}

export interface PianoChord {
  id: string;
  time: number;
  duration: number;
  notes: PianoNote[];
}

export interface PianoSong {
  id: string;
  title: string;
  credit?: string;
  duration: number;
  bpm: number;
  notes: PianoNote[];
  chords: PianoChord[];
}

const CHORD_WINDOW_SECONDS = 0.06;

export function midiNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function groupNotesIntoChords(
  notes: PianoNote[],
  windowSeconds = CHORD_WINDOW_SECONDS,
): PianoChord[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  const chords: PianoChord[] = [];

  for (const note of sorted) {
    const current = chords.at(-1);
    if (!current || note.time - current.time > windowSeconds) {
      chords.push({
        id: `chord-${chords.length}-${note.time.toFixed(3)}`,
        time: note.time,
        duration: note.duration,
        notes: [note],
      });
      continue;
    }

    current.notes.push(note);
    current.duration = Math.max(current.duration, note.time + note.duration - current.time);
  }

  return chords;
}

export function evaluatePlayedNotes(expected: number[], played: Iterable<number>) {
  const expectedSet = new Set(expected);
  const playedSet = new Set(played);
  const missing = expected.filter((note) => !playedSet.has(note));
  const extra = [...playedSet].filter((note) => !expectedSet.has(note));

  return {
    complete: missing.length === 0,
    exact: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

export async function parseMidiFile(file: File): Promise<PianoSong> {
  const midi = new Midi(await file.arrayBuffer());
  const notes: PianoNote[] = midi.tracks
    .filter((track) => track.channel !== 9)
    .flatMap((track, trackIndex) =>
      track.notes.map((note, noteIndex) => ({
        id: `${trackIndex}-${noteIndex}-${note.ticks}`,
        midi: note.midi,
        name: note.name || midiNoteName(note.midi),
        time: note.time,
        duration: Math.max(note.duration, 0.08),
        velocity: note.velocity,
        hand: note.midi < 60 ? 'left' as const : 'right' as const,
      })),
    );

  if (notes.length === 0) {
    throw new Error('This MIDI file does not contain any playable note tracks.');
  }

  const title = midi.name.trim() || file.name.replace(/\.(midi?|smf)$/i, '');
  const duration = Math.max(...notes.map((note) => note.time + note.duration));

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    title,
    duration,
    bpm: Math.round(midi.header.tempos[0]?.bpm ?? 120),
    notes,
    chords: groupNotesIntoChords(notes),
  };
}

function makeDemoNote(songId: string, index: number, midi: number, beat: number, beats = 1, secondsPerBeat = 0.6): PianoNote {
  return {
    id: `${songId}-${index}`,
    midi,
    name: midiNoteName(midi),
    time: beat * secondsPerBeat,
    duration: beats * secondsPerBeat * 0.92,
    velocity: 0.8,
    hand: midi < 60 ? 'left' : 'right',
  };
}

type MelodyStep = readonly [midi: number, beats?: number];

function makeBuiltInSong(
  id: string,
  title: string,
  credit: string,
  bpm: number,
  melody: readonly MelodyStep[],
): PianoSong {
  const secondsPerBeat = 60 / bpm;
  let beat = 0;
  const notes = melody.map(([midi, beats = 1], index) => {
    const note = makeDemoNote(id, index, midi, beat, beats, secondsPerBeat);
    beat += beats;
    return note;
  });

  return {
    id,
    title,
    credit,
    duration: beat * secondsPerBeat,
    bpm,
    notes,
    chords: groupNotesIntoChords(notes),
  };
}

export const BUILT_IN_PIANO_SONGS: PianoSong[] = [
  makeBuiltInSong('demo-twinkle', 'Twinkle, Twinkle', 'Traditional melody · Public domain', 100, [
    [60], [60], [67], [67], [69], [69], [67, 2],
    [65], [65], [64], [64], [62], [62], [60, 2],
  ]),
  makeBuiltInSong('demo-mary', 'Mary Had a Little Lamb', 'Traditional melody · Public domain', 104, [
    [64], [62], [60], [62], [64], [64], [64, 2],
    [62], [62], [62, 2], [64], [67], [67, 2],
    [64], [62], [60], [62], [64], [64], [64], [64],
    [62], [62], [64], [62], [60, 2],
  ]),
  makeBuiltInSong('demo-ode-to-joy', 'Ode to Joy', 'Ludwig van Beethoven · Public domain', 112, [
    [64], [64], [65], [67], [67], [65], [64], [62],
    [60], [60], [62], [64], [64, 1.5], [62, 0.5], [62, 2],
    [64], [64], [65], [67], [67], [65], [64], [62],
    [60], [60], [62], [64], [62, 1.5], [60, 0.5], [60, 2],
  ]),
  makeBuiltInSong('demo-frere-jacques', 'Frère Jacques', 'Traditional French round · Public domain', 108, [
    [60], [62], [64], [60], [60], [62], [64], [60],
    [64], [65], [67, 2], [64], [65], [67, 2],
    [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64], [60],
    [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64], [60],
    [60], [55], [60, 2], [60], [55], [60, 2],
  ]),
  makeBuiltInSong('demo-row-row-row', 'Row, Row, Row Your Boat', 'Traditional melody · Public domain', 108, [
    [60, 1.5], [60, 0.5], [60], [62, 0.5], [64, 1.5],
    [64], [62], [64], [65], [67, 2],
    [72, 0.5], [72, 0.5], [72, 0.5], [67, 0.5],
    [67, 0.5], [67, 0.5], [64, 0.5], [64, 0.5],
    [60], [67], [64], [62], [60, 2],
  ]),
  makeBuiltInSong('demo-happy-birthday', 'Happy Birthday to You', 'Traditional birthday song · Public domain', 96, [
    [67, 0.75], [67, 0.25], [69], [67], [72], [71, 2],
    [67, 0.75], [67, 0.25], [69], [67], [74], [72, 2],
    [67, 0.75], [67, 0.25], [79], [76], [72], [71], [69, 2],
    [77, 0.75], [77, 0.25], [76], [72], [74], [72, 2],
  ]),
];

export const DEMO_PIANO_SONG = BUILT_IN_PIANO_SONGS[0];
