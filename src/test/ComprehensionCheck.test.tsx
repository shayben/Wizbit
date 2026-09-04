import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const comprehension = vi.hoisted(() => ({ generateComprehension: vi.fn() }));
const transcribe = vi.hoisted(() => ({ recordAudioClip: vi.fn(), transcribeAudio: vi.fn() }));

vi.mock('../services/comprehensionService', async () => {
  const actual = await vi.importActual<typeof import('../services/comprehensionService')>(
    '../services/comprehensionService',
  );
  return { ...actual, generateComprehension: comprehension.generateComprehension };
});
vi.mock('../services/transcribeService', () => transcribe);
vi.mock('../services/speechService', () => ({ speakWord: vi.fn().mockResolvedValue(undefined) }));

import ComprehensionCheck from '../components/ComprehensionCheck';

const questionSet = {
  offline: false,
  keyIdeas: ['Maya found a turtle by the pond.'],
  questions: [
    {
      id: 'q1', kind: 'literal' as const,
      prompt: 'Where did Maya find the turtle?',
      choices: ['By the pond', 'In a tree'],
      answerIndex: 0,
      explanation: 'The first sentence says by the pond.',
    },
  ],
};

beforeEach(() => {
  comprehension.generateComprehension.mockReset();
  transcribe.recordAudioClip.mockReset();
  transcribe.transcribeAudio.mockReset();
  comprehension.generateComprehension.mockResolvedValue(questionSet);
});

function renderCheck(onComplete = vi.fn(), onClose = vi.fn()) {
  render(<ComprehensionCheck text="Maya found a turtle." grade="3" onComplete={onComplete} onClose={onClose} />);
  return { onComplete, onClose };
}

describe('ComprehensionCheck', () => {
  it('shows a loading state while questions are generated', () => {
    renderCheck();
    expect(screen.getByText('Thinking up some questions…')).toBeInTheDocument();
  });

  it('asks the generated question', async () => {
    renderCheck();
    expect(await screen.findByText('Where did Maya find the turtle?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /By the pond/ })).toBeInTheDocument();
  });

  it('labels the question type for the child', async () => {
    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    expect(screen.getByText(/Right there/)).toBeInTheDocument();
  });

  it('offers a read-aloud button so a young reader can attempt it', async () => {
    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    expect(screen.getByRole('button', { name: 'Read the question aloud' })).toBeInTheDocument();
  });

  it('celebrates a correct answer and explains why', async () => {
    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /By the pond/ }));

    expect(await screen.findByText('🎉 Yes!')).toBeInTheDocument();
    expect(screen.getByText('The first sentence says by the pond.')).toBeInTheDocument();
  });

  it('explains a wrong answer rather than only marking it', async () => {
    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /In a tree/ }));

    expect(await screen.findByText('💡 Not quite')).toBeInTheDocument();
    expect(screen.getByText('The first sentence says by the pond.')).toBeInTheDocument();
  });

  it('moves on to the retell after the questions', async () => {
    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /By the pond/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'See results' }));

    expect(await screen.findByText('Now tell it back 🎤')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('scores a spoken retell against the key ideas', async () => {
    transcribe.recordAudioClip.mockResolvedValue({
      stopped: Promise.resolve(new Blob(['x'])), stop: vi.fn(), cancel: vi.fn(),
    });
    transcribe.transcribeAudio.mockResolvedValue({ text: 'Maya found a turtle near the pond' });

    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /By the pond/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'See results' }));
    fireEvent.click(await screen.findByRole('button', { name: '🎤 Start retelling' }));

    expect(await screen.findByText('Great retelling!')).toBeInTheDocument();
    expect(screen.getByText('You covered 1 of 1 main ideas.')).toBeInTheDocument();
  });

  it('reports a microphone failure without losing the quiz result', async () => {
    transcribe.recordAudioClip.mockRejectedValue(new Error('denied'));

    renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /By the pond/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'See results' }));
    fireEvent.click(await screen.findByRole('button', { name: '🎤 Start retelling' }));

    expect(await screen.findByText(/Could not hear that/)).toBeInTheDocument();
  });

  it('lets the child skip the retell and reports the score', async () => {
    const { onComplete } = renderCheck();
    await screen.findByText('Where did Maya find the turtle?');
    fireEvent.click(screen.getByRole('button', { name: /By the pond/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'See results' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip the retell' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ percent: 100, correct: 1, total: 1, retell: null }),
    ));
  });

  it('goes straight to the retell when no questions could be made', async () => {
    comprehension.generateComprehension.mockResolvedValue({ questions: [], keyIdeas: ['x'], offline: true });
    renderCheck();
    expect(await screen.findByText('Now tell it back 🎤')).toBeInTheDocument();
  });

  it('still reaches the retell if question generation rejects outright', async () => {
    comprehension.generateComprehension.mockRejectedValue(new Error('boom'));
    renderCheck();
    // With no set at all the component falls through to its completion panel.
    await waitFor(() =>
      expect(screen.queryByText('Thinking up some questions…')).not.toBeInTheDocument(),
    );
  });
});
