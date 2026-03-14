'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMixerStore } from '@/store/mixerStore';

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));
const MIDI_DELTA_THRESHOLD = 0.01;

interface MIDIManagerState {
  isSupported: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  devices: string[];
  lastMessage: string | null;
  connect: () => Promise<void>;
}

export function useMIDIManager(): MIDIManagerState {
  const setVolume = useMixerStore((state) => state.setVolume);
  const setCrossfader = useMixerStore((state) => state.setCrossfader);
  const [isSupported, setIsSupported] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<string[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const listenersRef = useRef(new Map<MIDIInput, ((event: MIDIMessageEvent) => void) | null>());
  const lastCcValuesRef = useRef<Record<string, number>>({});

  const clearInputBindings = useCallback(() => {
    listenersRef.current.forEach((listener, input) => {
      if (input.onmidimessage === listener) {
        input.onmidimessage = null;
      }
    });
    listenersRef.current.clear();
  }, []);

  const bindInputs = useCallback((access: MIDIAccess) => {
    clearInputBindings();

    const inputNames: string[] = [];
    access.inputs.forEach((input) => {
      inputNames.push(input.name ?? 'MIDI Input');
      const handler = (event: MIDIMessageEvent) => {
        const [status = 0, cc = 0, rawValue = 0] = Array.from(event.data ?? []);
        if ((status & 0xf0) !== 0xb0) {
          return;
        }

        const normalized = clampUnit(rawValue / 127);
        const controlKey = `${input.id || input.name || 'midi'}:${cc}`;
        const previousValue = lastCcValuesRef.current[controlKey];
        if (previousValue !== undefined && Math.abs(normalized - previousValue) <= MIDI_DELTA_THRESHOLD) {
          return;
        }
        lastCcValuesRef.current[controlKey] = normalized;

        if (cc === 7) {
          setVolume('A', normalized);
        } else if (cc === 8) {
          setVolume('B', normalized);
        } else if (cc === 1) {
          setCrossfader(normalized * 2 - 1);
        } else {
          return;
        }

        setLastMessage(`${input.name ?? 'Controller'} • CC ${cc} → ${Math.round(normalized * 100)}%`);
      };

      input.onmidimessage = handler;
      listenersRef.current.set(input, handler);
    });

    setDevices(inputNames);
    setIsConnected(inputNames.length > 0);
  }, [clearInputBindings, setCrossfader, setVolume]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSupported(typeof navigator.requestMIDIAccess === 'function');
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      clearInputBindings();
      if (midiAccessRef.current) {
        midiAccessRef.current.onstatechange = null;
      }
    };
  }, [clearInputBindings]);

  const connect = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    setIsConnecting(true);

    try {
      const access = await navigator.requestMIDIAccess();
      midiAccessRef.current = access;
      access.onstatechange = () => bindInputs(access);
      bindInputs(access);
    } catch {
      setDevices([]);
      setIsConnected(false);
      setLastMessage('MIDI access denied');
    } finally {
      setIsConnecting(false);
    }
  }, [bindInputs]);

  return {
    isSupported,
    isConnecting,
    isConnected,
    devices,
    lastMessage,
    connect,
  };
}
