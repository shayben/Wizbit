import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DuelMode from '../components/DuelMode';
import type { ChildProfile } from '../services/profileService';

const profiles: ChildProfile[] = [
  { id: 'a', name: 'Maya', emoji: '🦊', grade: '3', createdAt: '' },
  { id: 'b', name: 'Ben', emoji: '🐨', grade: '1', createdAt: '' },
];

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function renderDuel(list = profiles, rounds = 2) {
  const onExit = vi.fn();
  render(<DuelMode profiles={list} roundsPerPlayer={rounds} onExit={onExit} />);
  return { onExit };
}

/** Solve whichever fact is on screen. */
function answerCurrent(correctly = true) {
  const text = screen.getByText(/= \?$/).textContent ?? '';
  const [, a, op, b] = text.match(/(\d+) ([+−×÷]) (\d+)/)!;
  const left = Number(a);
  const right = Number(b);
  const answer = op === '+' ? left + right
    : op === '−' ? left - right
    : op === '×' ? left * right
    : left / right;
  const entry = correctly ? answer : answer + 1;
  for (const digit of String(entry)) tap(digit);
  tap('Lock it in');
}

/** Play every turn of a 2-player, 2-round duel through to the result screen. */
function playFullDuel(results = [true, true, true, true]) {
  for (let i = 0; i < results.length; i += 1) {
    answerCurrent(results[i]);
    tap(i === results.length - 1 ? 'See the winner' : 'Pass the device');
  }
}

describe('DuelMode', () => {
  it('explains that two learners are needed when only one exists', () => {
    renderDuel([profiles[0]]);
    expect(screen.getByText('Head-to-head needs two learners')).toBeInTheDocument();
  });

  it('preselects two players and shows their grades', () => {
    renderDuel();
    expect(screen.getByRole('button', { name: /Maya/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Grade 3')).toBeInTheDocument();
    expect(screen.getByText('Grade 1')).toBeInTheDocument();
  });

  it('starts on the first player’s turn', () => {
    renderDuel();
    tap('Start the duel');
    expect(screen.getByText(/Maya's turn — question 1 of 2/)).toBeInTheDocument();
  });

  it('asks each player a question at their own grade', () => {
    renderDuel();
    tap('Start the duel');

    // Maya is grade 3, so she gets multiplication.
    expect(screen.getByText(/= \?$/).textContent).toContain('×');
    answerCurrent();
    tap('Pass the device');

    // Ben is grade 1, so he gets addition.
    expect(screen.getByText(/Ben's turn/)).toBeInTheDocument();
    expect(screen.getByText(/= \?$/).textContent).toContain('+');
  });

  it('awards points for a correct answer', () => {
    renderDuel();
    tap('Start the duel');
    answerCurrent(true);
    expect(screen.getByText(/\+\d+ points!/)).toBeInTheDocument();
  });

  it('reveals the answer after a miss instead of only marking it', () => {
    renderDuel();
    tap('Start the duel');
    answerCurrent(false);
    expect(screen.getByText(/The answer is \d+/)).toBeInTheDocument();
  });

  it('alternates turns strictly', () => {
    renderDuel();
    tap('Start the duel');
    answerCurrent();
    tap('Pass the device');
    expect(screen.getByText(/Ben's turn — question 1 of 2/)).toBeInTheDocument();
    answerCurrent();
    tap('Pass the device');
    expect(screen.getByText(/Maya's turn — question 2 of 2/)).toBeInTheDocument();
  });

  it('shows the last player their own feedback before the result', () => {
    renderDuel();
    tap('Start the duel');
    for (let i = 0; i < 3; i += 1) { answerCurrent(); tap('Pass the device'); }
    answerCurrent();

    expect(screen.getByRole('button', { name: 'See the winner' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
  });

  it('declares a result once both players finish', () => {
    renderDuel();
    tap('Start the duel');
    playFullDuel();
    expect(screen.getByText(/tie|wins|takes it/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again' })).toBeInTheDocument();
  });

  it('rewards the player who answered correctly', () => {
    renderDuel();
    tap('Start the duel');
    playFullDuel([true, false, true, false]); // Maya right twice, Ben wrong twice

    // Maya appears in both the winner headline and her score card.
    expect(screen.getAllByText(/Maya/).length).toBeGreaterThan(0);
    expect(screen.getByText('2/2 correct')).toBeInTheDocument();
    expect(screen.getByText('0/2 correct')).toBeInTheDocument();
  });

  it('returns to the player picker on play again', () => {
    renderDuel();
    tap('Start the duel');
    playFullDuel();
    tap('Play again');
    expect(screen.getByRole('button', { name: 'Start the duel' })).toBeInTheDocument();
  });

  it('exits to the caller', () => {
    const { onExit } = renderDuel();
    tap('← Back');
    expect(onExit).toHaveBeenCalled();
  });
});
