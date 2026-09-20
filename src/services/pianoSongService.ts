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

function makeDemoNote(midi: number, beat: number, beats = 1): PianoNote {
  return {
    id: `demo-${midi}-${beat}`,
    midi,
    name: midiNoteName(midi),
    time: beat * 0.6,
    duration: beats * 0.55,
    velocity: 0.8,
    hand: midi < 60 ? 'left' : 'right',
  };
}

const demoNotes = [
  makeDemoNote(60, 0), makeDemoNote(60, 1), makeDemoNote(67, 2), makeDemoNote(67, 3),
  makeDemoNote(69, 4), makeDemoNote(69, 5), makeDemoNote(67, 6, 2),
  makeDemoNote(65, 8), makeDemoNote(65, 9), makeDemoNote(64, 10), makeDemoNote(64, 11),
  makeDemoNote(62, 12), makeDemoNote(62, 13), makeDemoNote(60, 14, 2),
];

export const DEMO_PIANO_SONG: PianoSong = {
  id: 'demo-twinkle',
  title: 'Twinkle, Twinkle (melody)',
  duration: 9.6,
  bpm: 100,
  notes: demoNotes,
  chords: groupNotesIntoChords(demoNotes),
};
