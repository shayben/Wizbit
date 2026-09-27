import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiDelete = vi.hoisted(() => vi.fn());
const apiDownload = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());

vi.mock('../services/apiClient', () => ({
  apiDelete,
  apiDownload,
  apiGet,
  apiUpload,
}));

import {
  deleteMidiFile,
  listMidiFiles,
  loadMidiFile,
  saveMidiFile,
} from '../services/midiLibraryService';

beforeEach(() => {
  apiDelete.mockReset();
  apiDownload.mockReset();
  apiGet.mockReset();
  apiUpload.mockReset();
});

describe('midiLibraryService', () => {
  it('lists account MIDI metadata', async () => {
    apiGet.mockResolvedValue({ files: [{ id: 'midi_1', title: 'Song' }] });

    await expect(listMidiFiles('account')).resolves.toEqual([{ id: 'midi_1', title: 'Song' }]);
    expect(apiGet).toHaveBeenCalledWith('/midi-library?uid=account');
  });

  it('uploads MIDI content with a deterministic content id', async () => {
    const saved = {
      id: `midi_${'a'.repeat(64)}`,
      title: 'Song',
      fileName: 'song.mid',
      size: 8,
      uploadedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    apiUpload.mockResolvedValue({ file: saved });
    const file = new File(
      [Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6])],
      'song.mid',
      { type: 'audio/midi' },
    );

    await expect(saveMidiFile('account', file, 'Song')).resolves.toEqual(saved);
    expect(apiUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^\/midi-library\/midi_[a-f0-9]{64}\?uid=account$/),
      file,
      expect.objectContaining({
        'Content-Type': 'audio/midi',
        'X-Midi-Title': 'Song',
      }),
    );
  });

  it('downloads a saved MIDI as a File', async () => {
    apiDownload.mockResolvedValue(new Blob(['midi'], { type: 'audio/midi' }));
    const saved = {
      id: 'midi_1',
      title: 'Song',
      fileName: 'song.mid',
      size: 4,
      uploadedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };

    const file = await loadMidiFile('account', saved);
    expect(file.name).toBe('song.mid');
    expect(file.type).toBe('audio/midi');
  });

  it('deletes an account MIDI file', async () => {
    apiDelete.mockResolvedValue({ ok: true });
    await deleteMidiFile('account', 'midi_1');
    expect(apiDelete).toHaveBeenCalledWith('/midi-library/midi_1?uid=account');
  });
});
