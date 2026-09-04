import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/cosmosService', () => ({
  isCosmosConfigured: false, readDocument: vi.fn(), upsertDocument: vi.fn(),
}));

import FactDrill from '../components/FactDrill';
import { loadFactState } from '../services/mathFactService';

beforeEach(() => {
  localStorage.clear();
});

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

function renderDrill(grade: '1' | '3' = '3', uid: string | null = 'acct::kid') {
  const onExit = vi.fn();
  const onComplete = vi.fn();
  render(<FactDrill uid={uid} grade={grade} onExit={onExit} onComplete={onComplete} />);
  return { onExit, onComplete };
}

/** Read the fact currently on screen, e.g. "0 × 0 = ?". */
function currentPrompt(): { left: number; right: number; answer: number } {
  const text = screen.getByText(/= \?$/).textContent ?? '';
  const [, a, op, b] = text.match(/(\d+) ([+−×÷]) (\d+)/)!;
  const left = Number(a);
  const right = Number(b);
  const answer = op === '+' ? left + right
    : op === '−' ? left - right
    : op === '×' ? left * right
    : left / right;
  return { left, right, answer };
}

function enter(value: number) {
  for (const digit of String(value)) tap(digit);
  tap('Check answer');
}

describe('FactDrill', () => {
  it('opens on the mastery grid with the operations for the grade', async () => {
    renderDrill('3');
    expect(await screen.findByText(/facts instant/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Multiplication/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Division/ })).toBeInTheDocument();
  });

  it('offers a first grader addition and subtraction, not times tables', async () => {
    renderDrill('1');
    await screen.findByText(/facts instant/);
    expect(screen.getByRole('button', { name: /Addition/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Multiplication/ })).not.toBeInTheDocument();
  });

  it('starts a drill and shows a fact with a number pad', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);

    expect(await screen.findByText(/= \?$/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7' })).toBeInTheDocument();
  });

  it('accepts a correct answer and records it for the learner', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);

    const { answer } = currentPrompt();
    enter(answer);

    expect(await screen.findByText(/Instant!|Correct!/)).toBeInTheDocument();
    await waitFor(async () => {
      const state = await loadFactState('acct::kid');
      expect(Object.keys(state.stats).length).toBe(1);
    });
  });

  it('diagnoses a wrong answer instead of only marking it', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);

    const { answer } = currentPrompt();
    enter(answer + 1); // an off-by-one slip

    expect(await screen.findByText('So close — you were just one away.')).toBeInTheDocument();
  });

  it('clears the number pad between questions', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);

    enter(currentPrompt().answer);
    tap('Next');

    await waitFor(() => expect(screen.getByLabelText('Your answer')).toHaveTextContent('?'));
  });

  it('shows a ten frame for a first grader’s addition fact', async () => {
    renderDrill('1');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);

    expect(screen.getByRole('img', { name: /Ten frame/ })).toBeInTheDocument();
  });

  it('lets a child drill a single times table from the grid', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Practise the 7 times table' })[0]);

    expect(await screen.findByText('✖️ The 7s')).toBeInTheDocument();
    const { left, right } = currentPrompt();
    expect(left === 7 || right === 7).toBe(true);
  });

  it('keeps separate learners’ mastery apart', async () => {
    renderDrill('3', 'acct::kid-a');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);
    enter(currentPrompt().answer);

    await waitFor(async () => {
      expect(Object.keys((await loadFactState('acct::kid-a')).stats)).toHaveLength(1);
    });
    expect((await loadFactState('acct::kid-b')).stats).toEqual({});
  });

  it('returns to the grid from the drill', async () => {
    renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);
    await screen.findByText(/= \?$/);

    tap('← Back');
    expect(await screen.findByText(/facts instant/)).toBeInTheDocument();
  });

  it('exits to the caller from the overview', async () => {
    const { onExit } = renderDrill('3');
    await screen.findByText(/facts instant/);
    tap('← Back');
    expect(onExit).toHaveBeenCalled();
  });

  it('reports a summary when the drill finishes', async () => {
    const { onComplete } = renderDrill('3');
    await screen.findByText(/facts instant/);
    tap(/Start a 10-fact drill/);

    for (let i = 0; i < 10; i += 1) {
      await screen.findByText(/= \?$/);
      enter(currentPrompt().answer);
      tap(i < 9 ? 'Next' : 'See results');
    }

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ correct: 10, total: 10 }),
    ));
    expect(await screen.findByText('10 of 10 facts')).toBeInTheDocument();
  });
});
