'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

/**
 * Scale factor to convert typical RMS values (0–0.3 range) to a 0–1 visual range.
 * Multiply RMS by this constant so that moderate playback levels produce a visible pulse.
 */
const RMS_TO_VISUAL_SCALE = 3;

/**
 * Returns a `volumeScale` (0.0 – 1.0) derived from the deck's AnalyserNode,
 * updated once per animation frame to keep the UI thread smooth.
 */
export function useAudioAnalyzer(deckId: 'A' | 'B') {
  const [volumeScale, setVolumeScale] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const tick = () => {
      const { rms } = engine.getDeckEnergy(deckId);
      setVolumeScale(Math.min(1, rms * RMS_TO_VISUAL_SCALE));
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

  return { volumeScale };
}
