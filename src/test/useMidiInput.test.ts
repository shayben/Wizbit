import { describe, expect, it } from 'vitest';
import { getWebMidiUnsupportedMessage } from '../hooks/useMidiInput';

describe('getWebMidiUnsupportedMessage', () => {
  it('explains that Chrome on iPhone cannot provide Web MIDI', () => {
    const message = getWebMidiUnsupportedMessage({
      userAgent: 'Mozilla/5.0 (iPhone) CriOS/140.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });

    expect(message).toContain('iPhone or iPad');
    expect(message).toContain('including Chrome');
    expect(message).toContain('on-screen piano');
  });

  it('detects iPadOS devices that identify as a Mac', () => {
    const message = getWebMidiUnsupportedMessage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });

    expect(message).toContain('iPhone or iPad');
  });

  it('uses generic guidance for unsupported desktop browsers', () => {
    const message = getWebMidiUnsupportedMessage({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0',
      platform: 'Linux x86_64',
      maxTouchPoints: 0,
    });

    expect(message).toContain('not available in this browser');
    expect(message).not.toContain('including Chrome');
  });
});
