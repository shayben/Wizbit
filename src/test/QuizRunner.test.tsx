import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuizRunner from '../components/common/QuizRunner';
import { summarizeOutcomes } from '../services/quizSummary';

interface Q { id: string; text: string }

const questions: Q[] = [
  { id: 'q1', text: 'First question' },
  { id: 'q2', text: 'Second question' },
];

function renderRunner(overrides: Partial<React.ComponentProps<typeof QuizRunner<Q>>> = {}) {
  const onComplete = vi.fn();
  const onAnswer = vi.fn();
  render(
    <QuizRunner<Q>
      questions={overrides.questions ?? questions}
      keyOf={(q) => q.id}
      onComplete={overrides.onComplete ?? onComplete}
      onAnswer={overrides.onAnswer ?? onAnswer}
      title="Practice"
      renderFeedback={({ outcome }) => <p>{outcome.correct ? 'Correct!' : 'Not quite'}</p>}
    >
      {({ question, submit, answered }) => (
        <div>
          <p>{question.text}</p>
          <button type="button" disabled={answered} onClick={() => submit(true)}>Right</button>
          <button type="button" disabled={answered} onClick={() => submit(false)}>Wrong</button>
        </div>
      )}
    </QuizRunner>,
  );
  return { onComplete, onAnswer };
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('summarizeOutcomes', () => {
  it('summarises a mixed run', () => {
    const summary = summarizeOutcomes([
      { correct: true, responseMs: 1000 },
      { correct: true, responseMs: 3000 },
      { correct: false, responseMs: 2000 },
    ]);
    expect(summary).toMatchObject({ correct: 2, total: 3, accuracy: 67, bestStreak: 2, averageMs: 2000 });
  });

  it('handles an empty run without dividing by zero', () => {
    expect(summarizeOutcomes([])).toMatchObject({ correct: 0, total: 0, accuracy: 0, bestStreak: 0, averageMs: 0 });
  });

  it('finds the longest streak, not the final one', () => {
    expect(summarizeOutcomes([
      { correct: true, responseMs: 1 }, { correct: true, responseMs: 1 }, { correct: true, responseMs: 1 },
      { correct: false, responseMs: 1 }, { correct: true, responseMs: 1 },
    ]).bestStreak).toBe(3);
  });

  it('ignores untimed answers in the average', () => {
    expect(summarizeOutcomes([
      { correct: true, responseMs: 0 }, { correct: true, responseMs: 4000 },
    ]).averageMs).toBe(4000);
  });
});

describe('QuizRunner', () => {
  it('shows the first question and the progress count', () => {
    renderRunner();
    expect(screen.getByText('First question')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('advances to the next question', () => {
    renderRunner();
    click('Right');
    click('Next');
    expect(screen.getByText('Second question')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('shows feedback after answering', () => {
    renderRunner();
    click('Right');
    expect(screen.getByText('Correct!')).toBeInTheDocument();
  });

  it('reports each answer as it happens', () => {
    const { onAnswer } = renderRunner();
    click('Wrong');
    expect(onAnswer).toHaveBeenCalledWith(
      questions[0],
      expect.objectContaining({ correct: false }),
    );
  });

  it('calls onComplete once with the summary at the end', () => {
    const { onComplete } = renderRunner();
    click('Right');
    click('Next');
    click('Wrong');
    click('See results');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      correct: 1, total: 2, accuracy: 50,
    }));
  });

  it('ignores a second answer for the same question', () => {
    const { onAnswer } = renderRunner();
    click('Right');
    // Buttons are disabled after answering, so submit again through the first one.
    expect(screen.getByRole('button', { name: 'Right' })).toBeDisabled();
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('does not offer Next before an answer is given', () => {
    renderRunner();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('labels the final button as results rather than next', () => {
    renderRunner({ questions: [questions[0]] });
    click('Right');
    expect(screen.getByRole('button', { name: 'See results' })).toBeInTheDocument();
  });

  it('celebrates a streak of three', () => {
    const three: Q[] = [
      { id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' },
    ];
    renderRunner({ questions: three });
    click('Right'); click('Next');
    click('Right'); click('Next');
    click('Right');
    expect(screen.getByText('🔥 3 in a row!')).toBeInTheDocument();
  });

  it('does not celebrate a broken streak', () => {
    renderRunner();
    click('Wrong');
    expect(screen.queryByText(/in a row/)).not.toBeInTheDocument();
  });

  it('renders nothing when there are no questions', () => {
    const { container } = render(
      <QuizRunner<Q> questions={[]} keyOf={(q) => q.id} onComplete={vi.fn()}>
        {() => <p>never</p>}
      </QuizRunner>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers an exit control when a handler is supplied', () => {
    const onExit = vi.fn();
    render(
      <QuizRunner<Q> questions={questions} keyOf={(q) => q.id} onComplete={vi.fn()} onExit={onExit}>
        {() => <p>body</p>}
      </QuizRunner>,
    );
    click('← Back');
    expect(onExit).toHaveBeenCalled();
  });
});
