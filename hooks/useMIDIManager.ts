'use client';

import { useEffect, useState } from 'react';
import { useMixerStore } from '@/store/mixerStore';

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

interface MIDIManagerState {
  isSupported: boolean;
  isConnected: boolean;
  devices: string[];
  lastMessage: string | null;
}

export function useMIDIManager(): MIDIManagerState {
  const setVolume = useMixerStore((state) => state.setVolume);
  const setCrossfader = useMixerStore((state) => state.setCrossfader);
  const [isSupported, setIsSupported] = useState(false);
  const [devices, setDevices] = useState<string[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      return undefined;
    }

    let isMounted = true;
    let midiAccess: MIDIAccess | null = null;
    const listeners = new Map<MIDIInput, ((event: MIDIMessageEvent) => void) | null>();
    Promise.resolve().then(() => {
      if (isMounted) {
        setIsSupported(true);
      }
    });

    const handleMessage = (event: MIDIMessageEvent) => {
      const [status = 0, cc = 0, rawValue = 0] = Array.from(event.data ?? []);
      if ((status & 0xf0) !== 0xb0) {
        return;
      }

      const normalized = clampUnit(rawValue / 127);
      if (cc === 7) {
        setVolume('A', normalized);
      } else if (cc === 8) {
        setVolume('B', normalized);
      } else if (cc === 1) {
        setCrossfader(normalized * 2 - 1);
      } else {
        return;
      }

      const sourceName = event.currentTarget && 'name' in event.currentTarget
        ? String(event.currentTarget.name ?? 'Controller')
        : 'Controller';
      setLastMessage(`${sourceName} • CC ${cc} → ${Math.round(normalized * 100)}%`);
    };

    const bindInputs = () => {
      listeners.forEach((listener, input) => {
        if (input.onmidimessage === listener) {
          input.onmidimessage = null;
        }
      });
      listeners.clear();

      const inputNames: string[] = [];
      midiAccess?.inputs.forEach((input) => {
        inputNames.push(input.name ?? 'MIDI Input');
        input.onmidimessage = handleMessage;
        listeners.set(input, handleMessage);
      });

      if (isMounted) {
        setDevices(inputNames);
      }
    };

    void navigator.requestMIDIAccess().then((access) => {
      if (!isMounted) {
        return;
      }
      midiAccess = access;
      bindInputs();
      access.onstatechange = () => bindInputs();
    }).catch(() => {
      if (isMounted) {
        setDevices([]);
      }
    });

    return () => {
      isMounted = false;
      listeners.forEach((listener, input) => {
        if (input.onmidimessage === listener) {
          input.onmidimessage = null;
        }
      });
      if (midiAccess) {
        midiAccess.onstatechange = null;
      }
    };
  }, [setCrossfader, setVolume]);

  return {
    isSupported,
    isConnected: devices.length > 0,
    devices,
    lastMessage,
  };
}
