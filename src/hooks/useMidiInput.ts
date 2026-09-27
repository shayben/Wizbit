import { useCallback, useEffect, useRef, useState } from 'react';

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
};

export interface MidiDevice {
  id: string;
  name: string;
}

interface MidiPlatform {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

function isAppleMobilePlatform({ userAgent, platform, maxTouchPoints }: MidiPlatform) {
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function getWebMidiUnsupportedMessage(platform: MidiPlatform) {
  if (isAppleMobilePlatform(platform)) {
    return 'USB MIDI is not supported by browsers on iPhone or iPad, including Chrome. Use the on-screen piano, or open Wizbit in Chrome or Edge on a desktop.';
  }

  return 'USB MIDI is not available in this browser. Use the on-screen piano, or open Wizbit in Chrome or Edge on a desktop.';
}

export function useMidiInput(onNoteOn: (note: number, velocity: number) => void) {
  const midiNavigator = navigator as MidiNavigator;
  const isSupported = typeof midiNavigator.requestMIDIAccess === 'function';
  const unsupportedMessage = getWebMidiUnsupportedMessage({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'unsupported' | 'error'>(
    isSupported ? 'idle' : 'unsupported',
  );
  const [error, setError] = useState<string | null>(isSupported ? null : unsupportedMessage);
  const accessRef = useRef<MIDIAccess | null>(null);
  const callbackRef = useRef(onNoteOn);

  useEffect(() => {
    callbackRef.current = onNoteOn;
  }, [onNoteOn]);

  const attachInput = useCallback((deviceId: string) => {
    const access = accessRef.current;
    if (!access) return;

    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });

    const input = access.inputs.get(deviceId);
    if (!input) {
      setSelectedDeviceId('');
      setStatus('idle');
      return;
    }

    input.onmidimessage = (event) => {
      const data = event.data;
      if (!data) return;
      const [statusByte = 0, note = 0, velocity = 0] = data;
      if ((statusByte & 0xf0) === 0x90 && velocity > 0) {
        callbackRef.current(note, velocity / 127);
      }
    };
    setSelectedDeviceId(deviceId);
    setStatus('connected');
  }, []);

  const refreshDevices = useCallback((access: MIDIAccess) => {
    const nextDevices = [...access.inputs.values()].map((input) => ({
      id: input.id,
      name: [input.manufacturer, input.name].filter(Boolean).join(' ') || 'MIDI keyboard',
    }));
    setDevices(nextDevices);

    if (nextDevices.length === 0) {
      setSelectedDeviceId('');
      setStatus('idle');
      return;
    }

    const preferred = nextDevices.find((device) => device.id === selectedDeviceId)
      ?? nextDevices.find((device) => /casio|ctx|ct-x/i.test(device.name))
      ?? nextDevices[0];
    attachInput(preferred.id);
  }, [attachInput, selectedDeviceId]);

  const connect = useCallback(async () => {
    if (!midiNavigator.requestMIDIAccess) {
      setStatus('unsupported');
      setError(unsupportedMessage);
      return;
    }

    setStatus('connecting');
    setError(null);
    try {
      const access = await midiNavigator.requestMIDIAccess();
      accessRef.current = access;
      access.onstatechange = () => refreshDevices(access);
      refreshDevices(access);
    } catch (connectionError) {
      setStatus('error');
      setError(connectionError instanceof Error ? connectionError.message : 'Could not access MIDI devices.');
    }
  }, [midiNavigator, refreshDevices, unsupportedMessage]);

  useEffect(() => () => {
    const access = accessRef.current;
    if (!access) return;
    access.onstatechange = null;
    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  }, []);

  return {
    devices,
    selectedDeviceId,
    status,
    error,
    isSupported,
    connect,
    selectDevice: attachInput,
  };
}
