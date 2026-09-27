import { describe, expect, it } from 'vitest';
import {
  decodeMidiMetadata,
  encodeMidiMetadata,
  hasMidiHeader,
  isValidMidiId,
  midiBlobName,
} from '../src/lib/midiStorage.js';

describe('MIDI library storage helpers', () => {
  it('creates account-scoped blob names', () => {
    const id = `midi_${'a'.repeat(64)}`;
    expect(midiBlobName('account-1', id)).toMatch(new RegExp(`/${id}\\.mid$`));
    expect(midiBlobName('account-1', id)).not.toContain('account-1');
  });

  it('validates content-addressed MIDI ids', () => {
    expect(isValidMidiId(`midi_${'0'.repeat(64)}`)).toBe(true);
    expect(isValidMidiId('../other-account')).toBe(false);
    expect(isValidMidiId('midi_short')).toBe(false);
  });

  it('recognizes the Standard MIDI header', () => {
    expect(hasMidiHeader(Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0]))).toBe(true);
    expect(hasMidiHeader(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });

  it('round-trips unicode metadata through Azure-safe values', () => {
    const encoded = encodeMidiMetadata('골든 – Golden.mid');
    expect(decodeMidiMetadata(encoded, '')).toBe('골든 – Golden.mid');
  });
});
