import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PianoRoll from '../components/PianoRoll';

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
});
