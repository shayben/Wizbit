import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const speech = vi.hoisted(() => ({
  speakWord: vi.fn().mockResolvedValue(undefined),
  speakSound: vi.fn().mockResolvedValue(undefined),
  assessWord: vi.fn(),
}));
vi.mock('../services/speechService', () => speech);

import WordDrill, { WORD_DRILL_PASS_SCORE } from '../components/WordDrill';

function mockScore(score: number) {
  speech.assessWord.mockReturnValue({
    promise: Promise.resolve({ accuracyScore: score }),
    cancel: vi.fn(),
  });
}

beforeEach(() => {
  speech.assessWord.mockReset();
  mockScore(95);
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function renderDrill(words: string[], onWordResult = vi.fn(), onComplete = vi.fn()) {
  render(
    <WordDrill
      words={words}
      title="Practice"
      onWordResult={onWordResult}
      onComplete={onComplete}
      onExit={vi.fn()}
    />,
  );
  return { onWordResult, onComplete };
}

describe('WordDrill', () => {
  it('shows the word with a hear-it button', () => {
    renderDrill(['because']);
    expect(screen.getByText('because')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hear because' })).toBeInTheDocument();
  });

  it('passes a confidently pronounced word', async () => {
    const { onWordResult } = renderDrill(['because']);
    tap('🎤 Practice this word');

    expect(await screen.findByText('Nailed it!')).toBeInTheDocument();
    await waitFor(() => expect(onWordResult).toHaveBeenCalledWith('because', true));
  });

  it('fails a word scored below the pass mark', async () => {
    mockScore(WORD_DRILL_PASS_SCORE - 20);
    const { onWordResult } = renderDrill(['because']);
    tap('🎤 Practice this word');

    expect(await screen.findByText('Keep working on "because"')).toBeInTheDocument();
    await waitFor(() => expect(onWordResult).toHaveBeenCalledWith('because', false));
  });

  it('shows the pronunciation score alongside the verdict', async () => {
    mockScore(88);
    renderDrill(['because']);
    tap('🎤 Practice this word');
    expect(await screen.findByText('Pronunciation score: 88')).toBeInTheDocument();
  });

  it('counts a skipped word as a miss', () => {
    const { onWordResult } = renderDrill(['because']);
    tap('Skip this word');
    expect(onWordResult).toHaveBeenCalledWith('because', false);
  });

  it('reports the summary at the end', async () => {
    const { onComplete } = renderDrill(['a', 'b']);
    tap('🎤 Practice this word');
    await screen.findByText('Nailed it!');
    tap('Next');

    tap('Skip this word');
    tap('See results');

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: 1, total: 2 }),
    ));
  });

  it('celebrates an empty practice list rather than showing an error', () => {
    renderDrill([]);
    expect(screen.getByText('Nothing to practise right now!')).toBeInTheDocument();
  });

  it('does not leak the previous word’s score into the next word', async () => {
    mockScore(88);
    renderDrill(['a', 'b']);
    tap('🎤 Practice this word');
    await screen.findByText('Pronunciation score: 88');
    tap('Next');

    tap('Skip this word');
    expect(screen.queryByText('Pronunciation score: 88')).not.toBeInTheDocument();
  });
});
