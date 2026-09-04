import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({ speakWord: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/speechService', () => speech);

import SpellingDictation from '../components/SpellingDictation';

beforeEach(() => {
  speech.speakWord.mockClear();
});

function renderDictation(words: string[], onComplete = vi.fn(), onWordResult = vi.fn()) {
  render(
    <SpellingDictation words={words} onComplete={onComplete} onWordResult={onWordResult} onExit={vi.fn()} />,
  );
  return { onComplete, onWordResult };
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Spell the word you heard'), { target: { value } });

describe('SpellingDictation', () => {
  it('reads the word aloud without showing it', async () => {
    renderDictation(['cake']);
    await waitFor(() => expect(speech.speakWord).toHaveBeenCalledWith('cake', expect.anything()));
    expect(screen.queryByText('cake')).not.toBeInTheDocument();
  });

  it('names the spelling pattern being practised', () => {
    renderDictation(['cake']);
    expect(screen.getByText(/Silent e/)).toBeInTheDocument();
  });

  it('offers a replay button once the first reading finishes', async () => {
    renderDictation(['cake']);
    expect(await screen.findByRole('button', { name: /Hear the word again/ })).toBeInTheDocument();
  });

  it('accepts a correct spelling', () => {
    const { onWordResult } = renderDictation(['cake']);
    type('cake');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));

    expect(screen.getByText('Spelled it!')).toBeInTheDocument();
    expect(onWordResult).toHaveBeenCalledWith('cake', true);
  });

  it('forgives capitalisation', () => {
    renderDictation(['cake']);
    type('Cake');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));
    expect(screen.getByText('Spelled it!')).toBeInTheDocument();
  });

  it('shows the word and a rule-based hint after a miss', () => {
    const { onWordResult } = renderDictation(['cake']);
    type('kake');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));

    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(screen.getByText('cake')).toBeInTheDocument();
    expect(screen.getByText(/silent e/)).toBeInTheDocument();
    expect(onWordResult).toHaveBeenCalledWith('cake', false);
  });

  it('keeps the check button disabled until something is typed', () => {
    renderDictation(['cake']);
    expect(screen.getByRole('button', { name: 'Check spelling' })).toBeDisabled();
    type('c');
    expect(screen.getByRole('button', { name: 'Check spelling' })).toBeEnabled();
  });

  it('counts a skipped word as a miss', () => {
    const { onWordResult } = renderDictation(['cake']);
    fireEvent.click(screen.getByRole('button', { name: "I don't know this one" }));
    expect(onWordResult).toHaveBeenCalledWith('cake', false);
    expect(screen.getByText('(nothing)')).toBeInTheDocument();
  });

  it('clears the typed answer between words', async () => {
    renderDictation(['cake', 'bike']);
    type('cake');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Spell the word you heard')).toHaveValue(''),
    );
  });

  it('reports the summary at the end', async () => {
    const { onComplete } = renderDictation(['cake', 'bike']);
    type('cake');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    type('bicke');
    fireEvent.click(screen.getByRole('button', { name: 'Check spelling' }));
    fireEvent.click(screen.getByRole('button', { name: 'See results' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: 1, total: 2, accuracy: 50 }),
    ));
  });

  it('handles an empty word list gracefully', () => {
    renderDictation([]);
    expect(screen.getByText('No spelling words right now.')).toBeInTheDocument();
  });
});
