import { afterEach, describe, expect, it } from 'vitest';
import { _resetMidiStorageForTests, getMidiContainer } from '../src/lib/midiStorage.js';

const originalAccountUrl = process.env.MIDI_STORAGE_ACCOUNT_URL;

afterEach(() => {
  if (originalAccountUrl === undefined) delete process.env.MIDI_STORAGE_ACCOUNT_URL;
  else process.env.MIDI_STORAGE_ACCOUNT_URL = originalAccountUrl;
  _resetMidiStorageForTests();
});

describe('MIDI managed identity storage configuration', () => {
  it('stays disabled without a Blob service URL', async () => {
    delete process.env.MIDI_STORAGE_ACCOUNT_URL;
    _resetMidiStorageForTests();

    await expect(getMidiContainer()).resolves.toBeNull();
  });

  it('rejects connection strings and non-Blob URLs', async () => {
    process.env.MIDI_STORAGE_ACCOUNT_URL = 'DefaultEndpointsProtocol=https;AccountName=secret';
    _resetMidiStorageForTests();
    await expect(getMidiContainer()).resolves.toBeNull();

    process.env.MIDI_STORAGE_ACCOUNT_URL = 'https://example.com';
    _resetMidiStorageForTests();
    await expect(getMidiContainer()).resolves.toBeNull();
  });
});
