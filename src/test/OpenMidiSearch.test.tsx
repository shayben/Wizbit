import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OpenMidiSearch from '../components/OpenMidiSearch';
import {
  downloadOpenMidi,
  searchOpenMidiLibrary,
  type OpenMidiResult,
} from '../services/openMidiLibraryService';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';

vi.mock('../services/openMidiLibraryService', () => ({
  searchOpenMidiLibrary: vi.fn(),
  downloadOpenMidi: vi.fn(),
}));

vi.mock('../services/transcribeService', () => ({
  recordAudioClip: vi.fn(),
  transcribeAudio: vi.fn(),
}));

describe('OpenMidiSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchOpenMidiLibrary).mockResolvedValue([]);
  });

  it('searches automatically after transcribing a spoken query', async () => {
    const onVoiceSearchStart = vi.fn();
    vi.mocked(recordAudioClip).mockResolvedValue({
      stopped: Promise.resolve(new Blob(['a'.repeat(300)], { type: 'audio/webm' })),
      stop: vi.fn(),
      cancel: vi.fn(),
    });
    vi.mocked(transcribeAudio).mockResolvedValue({ text: 'Beethoven' });

    render(
      <OpenMidiSearch
        savesToLibrary
        onImport={vi.fn()}
        onVoiceSearchStart={onVoiceSearchStart}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search by voice' }));

    await waitFor(() => expect(searchOpenMidiLibrary).toHaveBeenCalledWith('Beethoven'));
    expect(onVoiceSearchStart).toHaveBeenCalledOnce();
    expect(screen.getByRole('searchbox')).toHaveValue('Beethoven');
  });

  it('stops an active voice recording when tapped again', async () => {
    const stop = vi.fn();
    vi.mocked(recordAudioClip).mockResolvedValue({
      stopped: new Promise(() => {}),
      stop,
      cancel: vi.fn(),
    });

    render(<OpenMidiSearch savesToLibrary={false} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search by voice' }));
    await waitFor(() => expect(recordAudioClip).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice search recording' }));

    expect(stop).toHaveBeenCalledOnce();
  });

  it('downloads and imports a selected result', async () => {
    const result: OpenMidiResult = {
      pageId: 42,
      title: 'Für Elise',
      fileName: 'Fur Elise.mid',
      downloadUrl: 'https://upload.wikimedia.org/fur-elise.mid',
      descriptionUrl: 'https://commons.wikimedia.org/wiki/File:Fur_Elise.mid',
      size: 1024,
      duration: 120,
      artist: 'Ludwig van Beethoven',
      license: 'Public domain',
      licenseUrl: null,
    };
    const file = new File(['midi'], result.fileName, { type: 'audio/midi' });
    const onImport = vi.fn().mockResolvedValue(undefined);
    vi.mocked(searchOpenMidiLibrary).mockResolvedValue([result]);
    vi.mocked(downloadOpenMidi).mockResolvedValue(file);

    render(<OpenMidiSearch savesToLibrary onImport={onImport} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beethoven' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add & practice' }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(file));
  });
});
