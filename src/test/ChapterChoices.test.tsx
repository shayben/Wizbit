import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChapterChoices from '../components/ChapterChoices';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';

vi.mock('../services/transcribeService', () => ({
  recordAudioClip: vi.fn(),
  transcribeAudio: vi.fn(),
}));

const choices = [
  { emoji: '🗺️', text: 'Follow the map' },
  { emoji: '🚪', text: 'Open the door' },
];

describe('ChapterChoices speech input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transcribes a spoken idea into the custom idea field', async () => {
    vi.mocked(recordAudioClip).mockResolvedValue({
      stopped: Promise.resolve(new Blob(['a'.repeat(300)], { type: 'audio/webm' })),
      stop: vi.fn(),
      cancel: vi.fn(),
    });
    vi.mocked(transcribeAudio).mockResolvedValue({ text: 'Climb the magic tree' });

    render(
      <ChapterChoices
        chapterNumber={1}
        chapterTitle="The Beginning"
        choices={choices}
        onChoose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Say your own idea' }));

    expect(await screen.findByDisplayValue('Climb the magic tree')).toBeInTheDocument();
    expect(transcribeAudio).toHaveBeenCalledOnce();
  });

  it('stops an active recording when the microphone button is tapped again', async () => {
    const stop = vi.fn();
    vi.mocked(recordAudioClip).mockResolvedValue({
      stopped: new Promise(() => {}),
      stop,
      cancel: vi.fn(),
    });

    render(
      <ChapterChoices
        chapterNumber={1}
        chapterTitle="The Beginning"
        choices={choices}
        onChoose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Say your own idea' }));
    await waitFor(() => expect(recordAudioClip).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording idea' }));

    expect(stop).toHaveBeenCalledOnce();
  });

  it('shows microphone permission errors and allows retrying', async () => {
    vi.mocked(recordAudioClip).mockRejectedValue(new Error('Permission denied'));

    render(
      <ChapterChoices
        chapterNumber={1}
        chapterTitle="The Beginning"
        choices={choices}
        onChoose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Say your own idea' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't access the microphone: Permission denied",
    );
    expect(screen.getByRole('button', { name: 'Say your own idea' })).toBeEnabled();
  });
});
