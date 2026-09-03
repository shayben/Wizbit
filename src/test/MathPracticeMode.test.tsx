import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MathPracticeMode from '../components/MathPracticeMode';

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

function startPractice() {
  render(<MathPracticeMode onExit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Kindergarten/ }));
  fireEvent.click(screen.getByRole('button', { name: /Counting/ }));
}

describe('MathPracticeMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows immediate positive feedback before moving to the next question', () => {
    startPractice();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('New math buddy unlocked!');
    expect(screen.getByRole('dialog')).toHaveTextContent('Pixel the Fox');
    fireEvent.click(screen.getByRole('button', { name: 'Keep going!' }));
    expect(screen.getByRole('status')).toHaveTextContent('Correct!');
    expect(screen.getByText('2 + 2 = ?')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('3 + 3 = ?')).toBeInTheDocument();
  });

  it('shows the correct answer immediately after an incorrect response', () => {
    startPractice();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));

    expect(screen.getByRole('status')).toHaveTextContent('Not quite');
    expect(screen.getByRole('status')).toHaveTextContent('The correct answer is 4.');
    expect(screen.getByRole('status')).toHaveTextContent('Start with the bigger number and count on.');
    expect(screen.getByText('2 + 2 = ?')).toBeInTheDocument();
  });
});
