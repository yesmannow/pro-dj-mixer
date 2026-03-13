'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

/**
 * Scale factor to convert typical RMS values (0–0.3 range) to a 0–1 visual range.
 * Multiply RMS by this constant so that moderate playback levels produce a visible pulse.
 */
const RMS_TO_VISUAL_SCALE = 3;

/** Minimum milliseconds between volumeScale state updates to prevent re-render loops. */
const VOLUME_THROTTLE_MS = 200;

export interface FrequencyRGB {
  red: number;   // Bass energy (0-255)
  green: number; // Mid/Vocal energy (0-255)
  blue: number;  // High-hat/Air energy (0-255)
}

const getFrequencyData = (analyser: AnalyserNode): FrequencyRGB => {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Divide the spectrum into Low (Bass), Mid (Vocals), and High (Percussion)
  const lowEnd = dataArray.slice(0, Math.floor(bufferLength * 0.1));
  const midRange = dataArray.slice(Math.floor(bufferLength * 0.1), Math.floor(bufferLength * 0.5));
  const highEnd = dataArray.slice(Math.floor(bufferLength * 0.5));

  const average = (arr: Uint8Array) => {
    if (arr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum / arr.length;
  };

  return {
    red: average(lowEnd),     // Bass Energy
    green: average(midRange), // Vocal/Instrument Energy
    blue: average(highEnd),   // High-hat/Air Energy
  };
};

/**
 * Returns a `volumeScale` (0.0 – 1.0) for the deck's AnalyserNode.
 *
 * Frequency RGB data is stored in `frequencyRGBRef` (a ref, not state) and updated on every
 * animation frame so that canvas-based consumers can read it without triggering re-renders.
 *
 * `volumeScale` state is throttled to at most once per 200 ms to avoid the infinite
 * re-render loop (React Error #185) that occurs when setState is called at 60 fps.
 */
export function useAudioAnalyzer(deckId: 'A' | 'B') {
  const [volumeScale, setVolumeScale] = useState(0);
  // Frequency data lives in a ref — canvas consumers read it directly, no React re-renders.
  const frequencyRGBRef = useRef<FrequencyRGB>({ red: 0, green: 0, blue: 0 });
  const rafRef = useRef<number | null>(null);
  const lastThrottleRef = useRef<number>(0);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const tick = (timestamp: number) => {
      const { rms } = engine.getDeckEnergy(deckId);

      // Update frequency data into a ref — zero React re-renders
      const analyser = engine.getDeckAnalyser(deckId);
      if (analyser) {
        frequencyRGBRef.current = getFrequencyData(analyser);
      }

      // Throttle volumeScale state update to once per VOLUME_THROTTLE_MS
      if (timestamp - lastThrottleRef.current >= VOLUME_THROTTLE_MS) {
        setVolumeScale(Math.min(1, rms * RMS_TO_VISUAL_SCALE));
        lastThrottleRef.current = timestamp;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [deckId]);

  return { volumeScale, frequencyRGBRef };
}
