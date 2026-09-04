import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wordProblems = vi.hoisted(() => ({ generateWordProblems: vi.fn() }));
vi.mock('../services/wordProblemService', async () => {
  const actual = await vi.importActual<typeof import('../services/wordProblemService')>(
    '../services/wordProblemService',
  );
  return { ...actual, generateWordProblems: wordProblems.generateWordProblems };
});
vi.mock('../services/speechService', () => ({ speakWord: vi.fn().mockResolvedValue(undefined) }));

import WordProblemMode from '../components/WordProblemMode';

const problem = {
  id: 'wp1',
  text: 'Maya has 3 apples. Ben gives her 4 more. How many apples does Maya have now?',
  answer: 7,
  unit: 'apples',
  structure: 'join' as const,
  equation: '3 + 4 = 7',
  strategy: 'Putting groups together means adding.',
};

beforeEach(() => {
  wordProblems.generateWordProblems.mockReset();
  wordProblems.generateWordProblems.mockResolvedValue({ problems: [problem], offline: true });
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function renderMode(onComplete = vi.fn()) {
  const onExit = vi.fn();
  render(<WordProblemMode grade="1" learnerName="Maya" count={1} onComplete={onComplete} onExit={onExit} />);
  return { onComplete, onExit };
}

describe('WordProblemMode', () => {
  it('shows a loading state while problems are generated', () => {
    renderMode();
    expect(screen.getByText('Writing some problems…')).toBeInTheDocument();
  });

  it('shows the problem text and its structure', async () => {
    renderMode();
    expect(await screen.findByText(problem.text)).toBeInTheDocument();
    expect(screen.getByText(/Putting together/)).toBeInTheDocument();
  });

  it('offers a read-aloud button so a young child can attempt it', async () => {
    renderMode();
    await screen.findByText(problem.text);
    expect(screen.getByRole('button', { name: /Read the problem aloud/ })).toBeInTheDocument();
  });

  it('names the unit the answer should be in', async () => {
    renderMode();
    await screen.findByText(problem.text);
    expect(screen.getByText('Answer in apples')).toBeInTheDocument();
  });

  it('accepts a correct answer and shows the equation', async () => {
    renderMode();
    await screen.findByText(problem.text);
    tap('7');
    tap('Check answer');

    expect(await screen.findByText('Solved it!')).toBeInTheDocument();
    expect(screen.getByText('3 + 4 = 7')).toBeInTheDocument();
  });

  it('reveals the answer and the set-up strategy after a miss', async () => {
    renderMode();
    await screen.findByText(problem.text);
    tap('9');
    tap('Check answer');

    expect(await screen.findByText('The answer is 7')).toBeInTheDocument();
    expect(screen.getByText('Putting groups together means adding.')).toBeInTheDocument();
  });

  it('passes the learner name through to the generator', async () => {
    renderMode();
    await screen.findByText(problem.text);
    expect(wordProblems.generateWordProblems).toHaveBeenCalledWith(
      expect.objectContaining({ grade: '1', learnerName: 'Maya', count: 1 }),
    );
  });

  it('reports a summary when finished', async () => {
    const { onComplete } = renderMode();
    await screen.findByText(problem.text);
    tap('7');
    tap('Check answer');
    tap('See results');

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: 1, total: 1 }),
    ));
    expect(await screen.findByText('1 of 1 solved')).toBeInTheDocument();
  });

  it('handles a generator that returns nothing', async () => {
    wordProblems.generateWordProblems.mockResolvedValue({ problems: [], offline: true });
    renderMode();
    expect(await screen.findByText('No problems available right now.')).toBeInTheDocument();
  });

  it('handles a generator that rejects', async () => {
    wordProblems.generateWordProblems.mockRejectedValue(new Error('boom'));
    renderMode();
    expect(await screen.findByText('No problems available right now.')).toBeInTheDocument();
  });
});
