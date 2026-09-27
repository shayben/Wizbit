import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PianoRoll from '../components/PianoRoll';
import type { PianoChord } from '../services/pianoSongService';

describe('PianoRoll', () => {
  it('plays notes from the on-screen keyboard', () => {
    const onPlayNote = vi.fn();
    render(
      <PianoRoll
        chords={[]}
        currentIndex={0}
        pressedNotes={new Set()}
        onPlayNote={onPlayNote}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play 60' }));
    expect(onPlayNote).toHaveBeenCalledWith(60);
  });

  it('shows computer-key mappings for the middle octave', () => {
    render(
      <PianoRoll
        chords={[]}
        currentIndex={0}
        pressedNotes={new Set()}
        onPlayNote={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Play 60' })).toHaveTextContent('A');
    expect(screen.getByRole('button', { name: 'Play 72' })).toHaveTextContent('K');
  });

  it('aligns falling notes with their matching white and black keys', () => {
    const chords: PianoChord[] = [{
      id: 'target',
      time: 0,
      duration: 1,
      notes: [
        { id: 'c4', midi: 60, name: 'C4', time: 0, duration: 1, velocity: 1, hand: 'right' },
        { id: 'c-sharp-4', midi: 61, name: 'C#4', time: 0, duration: 1, velocity: 1, hand: 'right' },
      ],
    }];
    const { container } = render(
      <PianoRoll
        chords={chords}
        currentIndex={0}
        pressedNotes={new Set()}
        onPlayNote={() => undefined}
      />,
    );

    for (const midi of [60, 61]) {
      const note = container.querySelector<HTMLElement>(`[data-midi-note="${midi}"]`);
      const key = container.querySelector<HTMLElement>(`[data-piano-key="${midi}"]`);

      expect(note).not.toBeNull();
      expect(key).not.toBeNull();
      expect(note?.style.left).toBe(key?.style.left);
      expect(note?.style.width).toBe(key?.style.width);
    }
  });
});
