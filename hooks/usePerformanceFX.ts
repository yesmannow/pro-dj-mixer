import { useCallback, useEffect, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';
import type { CuePoint, Track } from '@/lib/db';
import { broadcastCue } from '@/lib/syncManager';
import { getCueTrackHash } from '@/store/trackCueStore';

export type PerformancePadMode = 'hot' | 'slip-roll' | 'beat-break';

interface UsePerformanceFXOptions {
  deckId: 'A' | 'B';
  track: Track | null;
  cuePoints: CuePoint[];
  currentTime: number;
  bpm: number;
  setCue: (track: Track, slot: number, time: number, type: 'hot' | 'memory', metadata?: { label?: string; color?: string }) => Promise<void>;
}

const MODE_METADATA: Record<Exclude<PerformancePadMode, 'hot'>, { label: string; color: string }> = {
  'slip-roll': { label: 'Slip Roll', color: '#FFD700' },
  'beat-break': { label: 'Beat Break', color: '#FF003C' },
};

const getSlipRollBeatFraction = (slot: number) => (slot < 4 ? 0.25 : 0.125);

export function usePerformanceFX({
  deckId,
  track,
  cuePoints,
  currentTime,
  bpm,
  setCue,
}: UsePerformanceFXOptions) {
  const [padMode, setPadMode] = useState<PerformancePadMode>('hot');
  const [activeRoll, setActiveRoll] = useState(false);

  useEffect(() => {
    if (!activeRoll || padMode !== 'slip-roll' || typeof navigator === 'undefined' || !navigator.vibrate) {
      return undefined;
    }

    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const interval = window.setInterval(() => {
      navigator.vibrate?.([10, 50, 10]);
    }, Math.max(100, (60 / safeBpm) * 1000));

    return () => {
      window.clearInterval(interval);
    };
  }, [activeRoll, bpm, padMode]);

  const resolveCueTime = useCallback(async (slot: number) => {
    if (!track) return null;

    const existing = cuePoints.find((cue) => cue.slot === slot);
    if (existing) {
      return existing.time;
    }

    const cueTime = currentTime;
    const modeMeta = padMode === 'hot' ? null : MODE_METADATA[padMode];
    await setCue(track, slot, cueTime, 'hot', modeMeta ? { label: modeMeta.label, color: modeMeta.color } : undefined);
    broadcastCue(getCueTrackHash(track), {
      slot,
      time: cueTime,
      type: 'hot',
      timestamp: Date.now(),
      color: modeMeta?.color ?? '#FFD700',
      name: modeMeta?.label ?? `Cue ${slot}`,
    });
    return cueTime;
  }, [cuePoints, currentTime, padMode, setCue, track]);

  const handleCueTimeHold = useCallback((cueTime: number, slot?: number) => {
    const engine = AudioEngine.getInstance();
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;

    if (padMode === 'slip-roll') {
      setActiveRoll(true);
      engine.startSlipRoll(deckId, cueTime, currentTime, safeBpm, slot === undefined ? 0.25 : getSlipRollBeatFraction(slot));
      return;
    }

    if (padMode === 'beat-break') {
      engine.startBeatBreak(deckId, cueTime, currentTime, safeBpm);
      return;
    }

    engine.startStutter(deckId, cueTime);
  }, [bpm, currentTime, deckId, padMode]);

  const handleCueTimeRelease = useCallback((cueTime: number) => {
    const engine = AudioEngine.getInstance();

    if (padMode === 'slip-roll') {
      setActiveRoll(false);
      engine.stopSlipRoll(deckId);
      return;
    }

    if (padMode === 'beat-break') {
      engine.stopBeatBreak(deckId);
      return;
    }

    engine.stopStutter(deckId, cueTime);
  }, [deckId, padMode]);

  const handlePadHold = useCallback(async (slot: number) => {
    const cueTime = await resolveCueTime(slot);
    if (cueTime === null) return;
    handleCueTimeHold(cueTime, slot);
  }, [handleCueTimeHold, resolveCueTime]);

  const handlePadRelease = useCallback((slot: number) => {
    const cueTime = cuePoints.find((cue) => cue.slot === slot)?.time ?? currentTime;
    handleCueTimeRelease(cueTime);
  }, [cuePoints, currentTime, handleCueTimeRelease]);

  return {
    padMode,
    setPadMode,
    handlePadHold,
    handlePadRelease,
    handleCueTimeHold,
    handleCueTimeRelease,
  };
}
