import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PIANO_SONGS,
  evaluatePlayedNotes,
  groupNotesIntoChords,
  midiNoteName,
  type PianoNote,
} from '../services/pianoSongService';

function note(midi: number, time: number): PianoNote {
  return {
    id: `${midi}-${time}`,
    midi,
    name: midiNoteName(midi),
    time,
    duration: 0.5,
    velocity: 0.8,
    hand: midi < 60 ? 'left' : 'right',
  };
}

describe('pianoSongService', () => {
  it('names MIDI pitches using scientific pitch notation', () => {
    expect(midiNoteName(60)).toBe('C4');
    expect(midiNoteName(66)).toBe('F#4');
    expect(midiNoteName(21)).toBe('A0');
  });

  it('groups near-simultaneous notes into chords', () => {
    const chords = groupNotesIntoChords([
      note(64, 1.03),
      note(60, 1),
      note(67, 1.05),
      note(69, 2),
    ]);

    expect(chords).toHaveLength(2);
    expect(chords[0].notes.map((item) => item.midi)).toEqual([60, 64, 67]);
    expect(chords[1].notes.map((item) => item.midi)).toEqual([69]);
  });

  it('reports missing and extra played notes', () => {
    expect(evaluatePlayedNotes([60, 64, 67], [60, 64])).toEqual({
      complete: false,
      exact: false,
      missing: [67],
      extra: [],
    });
    expect(evaluatePlayedNotes([60, 64], [60, 64, 70])).toEqual({
      complete: true,
      exact: false,
      missing: [],
      extra: [70],
    });
  });

  it('provides distinct playable public-domain lessons', () => {
    expect(BUILT_IN_PIANO_SONGS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(BUILT_IN_PIANO_SONGS.map((song) => song.id)).size).toBe(BUILT_IN_PIANO_SONGS.length);
    for (const song of BUILT_IN_PIANO_SONGS) {
      expect(song.credit).toContain('Public domain');
      expect(song.notes.length).toBeGreaterThan(10);
      expect(song.chords.length).toBe(song.notes.length);
    }
  });

  it('includes the complete Happy Birthday melody', () => {
    const song = BUILT_IN_PIANO_SONGS.find((item) => item.id === 'demo-happy-birthday');

    expect(song?.title).toBe('Happy Birthday to You');
    expect(song?.notes.map((item) => item.midi)).toEqual([
      67, 67, 69, 67, 72, 71,
      67, 67, 69, 67, 74, 72,
      67, 67, 79, 76, 72, 71, 69,
      77, 77, 76, 72, 74, 72,
    ]);
    expect(song?.duration).toBe(15.625);
  });
});
