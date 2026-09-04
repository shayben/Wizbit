import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MathPracticeMode from '../components/MathPracticeMode';

vi.mock('../services/speechService', () => ({ speakWord: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../services/mathService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/mathService')>();
  return {
    ...actual,
    MATH_BUDDIES: [{ id: 'pixel', name: 'Pixel the Fox', emoji: '🦊', requiredCorrect: 1 }],
    generateMathQuestions: () => [
      { id: 'first', prompt: '2 + 2 = ?', answer: 4, tip: 'Start with the bigger number and count on.' },
      { id: 'second', prompt: '3 + 3 = ?', answer: 6, tip: 'Start with the bigger number and count on.' },
    ],
    getUnlockedMathBuddyIds: () => [],
    loadMathSessions: () => Promise.resolve([]),
    saveMathSession: vi.fn(),
    unlockMathBuddy: vi.fn(),
  };
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

/** Enter an answer on the number pad and submit it. */
function answer(value: string) {
  for (const digit of value) tap(digit);
  tap('Check answer');
}

function startPractice(grade?: 'K' | '1' | '3', skill: RegExp = /Counting/) {
  render(<MathPracticeMode grade={grade} onExit={vi.fn()} />);
  if (!grade) tap(/Kindergarten/);
  tap(skill);
}

describe('MathPracticeMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows immediate positive feedback before moving to the next question', () => {
    startPractice();
    answer('4');

    expect(screen.getByRole('dialog')).toHaveTextContent('New math buddy unlocked!');
    expect(screen.getByRole('dialog')).toHaveTextContent('Pixel the Fox');
    tap('Keep going!');

    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(screen.getByText('2 + 2 = ?')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    tap('Next question');
    expect(screen.getByText('3 + 3 = ?')).toBeInTheDocument();
  });

  it('shows the correct answer and the strategy after an incorrect response', () => {
    startPractice();
    answer('5');

    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByRole('status')).toHaveTextContent('The correct answer is 4.');
    expect(screen.getByRole('status')).toHaveTextContent('Start with the bigger number and count on.');
    expect(screen.getByText('2 + 2 = ?')).toBeInTheDocument();
  });

  it('diagnoses the specific mistake rather than only repeating the tip', () => {
    startPractice();
    answer('5'); // one more than the answer

    expect(screen.getByRole('status')).toHaveTextContent('So close — you were just one away.');
  });

  it('answers through a number pad rather than a keyboard field', () => {
    startPractice();
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('?');

    tap('4');
    expect(screen.getByLabelText('Your answer')).toHaveTextContent('4');
  });

  it('clears the pad between questions', () => {
    startPractice();
    answer('4');
    tap('Keep going!');
    tap('Next question');

    expect(screen.getByLabelText('Your answer')).toHaveTextContent('?');
  });

  it('reads the question aloud on request', () => {
    startPractice();
    expect(screen.getByRole('button', { name: 'Read the question aloud' })).toBeInTheDocument();
  });

  it('shows a ten frame for an early-grade addition question', () => {
    startPractice();
    expect(screen.getByRole('img', { name: 'Ten frame showing 2 plus 2' })).toBeInTheDocument();
  });

  it('does not show a ten frame for an older learner', () => {
    startPractice('3', /Times Tables/);
    expect(screen.queryByRole('img', { name: /Ten frame/ })).not.toBeInTheDocument();
  });

  it('skips the grade picker when the learner’s grade is known', () => {
    render(<MathPracticeMode grade="K" onExit={vi.fn()} />);
    expect(screen.queryByText('Choose your grade')).not.toBeInTheDocument();
    expect(screen.getByText(/Kindergarten/)).toBeInTheDocument();
  });

  it('keeps the check button disabled until an answer is entered', () => {
    startPractice();
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeDisabled();
    tap('4');
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeEnabled();
  });
});
