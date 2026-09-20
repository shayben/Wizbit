import { useCallback, useEffect, useRef, useState } from 'react';

type MidiNavigator = Navigator & {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
};

export interface MidiDevice {
  id: string;
  name: string;
}

export function useMidiInput(onNoteOn: (note: number, velocity: number) => void) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'unsupported' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
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
    const midiNavigator = navigator as MidiNavigator;
    if (!midiNavigator.requestMIDIAccess) {
      setStatus('unsupported');
      setError('Web MIDI is not available in this browser. Use Chrome or Edge on desktop.');
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
  }, [refreshDevices]);

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
    connect,
    selectDevice: attachInput,
  };
}
