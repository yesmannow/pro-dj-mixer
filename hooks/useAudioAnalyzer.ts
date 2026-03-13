'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

/**
 * Scale factor to convert typical RMS values (0–0.3 range) to a 0–1 visual range.
 * Multiply RMS by this constant so that moderate playback levels produce a visible pulse.
 */
const RMS_TO_VISUAL_SCALE = 3;

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
 * Returns a `volumeScale` (0.0 – 1.0) and `frequencyRGB` derived from the deck's AnalyserNode,
 * updated once per animation frame to keep the UI thread smooth.
 */
export function useAudioAnalyzer(deckId: 'A' | 'B') {
  const [volumeScale, setVolumeScale] = useState(0);
  const [frequencyRGB, setFrequencyRGB] = useState<FrequencyRGB>({ red: 0, green: 0, blue: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const tick = () => {
      const { rms } = engine.getDeckEnergy(deckId);
      setVolumeScale(Math.min(1, rms * RMS_TO_VISUAL_SCALE));

      // Read RGB frequency bins from the deck analyser
      const analyser = engine.getDeckAnalyser(deckId);
      if (analyser) {
        setFrequencyRGB(getFrequencyData(analyser));
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

  return { volumeScale, frequencyRGB };
}
