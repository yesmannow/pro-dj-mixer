'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AudioEngine } from '@/lib/audioEngine';
import { useDeckStore } from '@/store/deckStore';
import { useMixerStore } from '@/store/mixerStore';

interface RemixSlotState {
  buffer: AudioBuffer | null;
  deckId: 'A' | 'B' | null;
  sourceBpm: number;
  bars: number;
  isPlaying: boolean;
}

const REMIX_SLOT_COUNT = 4;
const FOUR_BAR_LOOP_BEATS = 16;
const EMPTY_SLOT: RemixSlotState = {
  buffer: null,
  deckId: null,
  sourceBpm: 120,
  bars: 4,
  isPlaying: false,
};

const getSafeBpm = (value: string | number | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function RemixGrid() {
  const [slots, setSlots] = useState<RemixSlotState[]>(() => Array.from({ length: REMIX_SLOT_COUNT }, () => ({ ...EMPTY_SLOT })));
  const deckA = useDeckStore((state) => state.deckA);
  const deckB = useDeckStore((state) => state.deckB);
  const crossfader = useMixerStore((state) => state.crossfader);
  const slotSourcesRef = useRef<Array<{ source: AudioBufferSourceNode; gain: GainNode } | null>>(
    Array.from({ length: REMIX_SLOT_COUNT }, () => null)
  );

  const activeDeckId = useMemo<'A' | 'B'>(() => {
    if (deckA.isPlaying && !deckB.isPlaying) return 'A';
    if (deckB.isPlaying && !deckA.isPlaying) return 'B';
    return crossfader <= 0 ? 'A' : 'B';
  }, [crossfader, deckA.isPlaying, deckB.isPlaying]);

  const activeDeck = activeDeckId === 'A' ? deckA : deckB;
  const fallbackDeck = activeDeckId === 'A' ? deckB : deckA;
  const masterBpm = useMemo(() => {
    const activeBpm = getSafeBpm(activeDeck.track?.bpm, 0);
    if (activeBpm > 0) return activeBpm;
    return getSafeBpm(fallbackDeck.track?.bpm, 120);
  }, [activeDeck.track?.bpm, fallbackDeck.track?.bpm]);

  const stopSlot = useCallback((slotIndex: number) => {
    const activeSource = slotSourcesRef.current[slotIndex];
    if (activeSource) {
      try {
        activeSource.source.stop();
      } catch {
        // Ignore already-stopped remix sources.
      }
      activeSource.source.disconnect();
      activeSource.gain.disconnect();
      slotSourcesRef.current[slotIndex] = null;
    }

    setSlots((current) => current.map((slot, index) => (
      index === slotIndex ? { ...slot, isPlaying: false } : slot
    )));
  }, []);

  useEffect(() => () => {
    slotSourcesRef.current.forEach((_, slotIndex) => stopSlot(slotIndex));
  }, [stopSlot]);

  const captureSlot = useCallback((slotIndex: number) => {
    if (!activeDeck.buffer) return;

    stopSlot(slotIndex);

    const sourceBpm = getSafeBpm(activeDeck.track?.bpm, masterBpm);
    // Four bars in 4/4 time equals sixteen beats, so each captured pad stays phrase-aligned.
    const loopDurationSeconds = (60 / sourceBpm) * FOUR_BAR_LOOP_BEATS;
    const captureStart = Math.max(0, Math.min(activeDeck.currentTime, Math.max(0, activeDeck.buffer.duration - loopDurationSeconds)));
    const frameStart = Math.floor(captureStart * activeDeck.buffer.sampleRate);
    const frameCount = Math.max(1, Math.floor(loopDurationSeconds * activeDeck.buffer.sampleRate));
    const captureBuffer = new AudioBuffer({
      length: frameCount,
      numberOfChannels: activeDeck.buffer.numberOfChannels,
      sampleRate: activeDeck.buffer.sampleRate,
    });

    for (let channel = 0; channel < activeDeck.buffer.numberOfChannels; channel += 1) {
      const sourceData = activeDeck.buffer.getChannelData(channel);
      const destination = captureBuffer.getChannelData(channel);
      let writeOffset = 0;
      let readOffset = frameStart;

      while (writeOffset < frameCount) {
        const remaining = frameCount - writeOffset;
        const available = sourceData.length - readOffset;
        const chunkLength = Math.min(remaining, available);
        destination.set(sourceData.subarray(readOffset, readOffset + chunkLength), writeOffset);
        writeOffset += chunkLength;
        readOffset = (readOffset + chunkLength) % sourceData.length;
      }
    }

    setSlots((current) => current.map((slot, index) => (
      index === slotIndex
        ? {
            buffer: captureBuffer,
            deckId: activeDeckId,
            sourceBpm,
            bars: 4,
            isPlaying: false,
          }
        : slot
    )));
  }, [activeDeck.buffer, activeDeck.currentTime, activeDeck.track?.bpm, activeDeckId, masterBpm, stopSlot]);

  const triggerSlot = useCallback((slotIndex: number) => {
    const slot = slots[slotIndex];
    if (!slot.buffer) return;

    stopSlot(slotIndex);

    const engine = AudioEngine.getInstance();
    const source = engine.context.createBufferSource();
    const gain = engine.context.createGain();
    source.buffer = slot.buffer;
    source.loop = true;
    source.playbackRate.value = Math.max(0.5, Math.min(2, masterBpm / Math.max(1, slot.sourceBpm)));
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(engine.getRemixBus());

    const beatLength = 60 / masterBpm;
    const phase = ((activeDeck.currentTime % beatLength) + beatLength) % beatLength;
    const launchDelay = phase < 0.001 ? 0 : beatLength - phase;
    source.start(engine.context.currentTime + launchDelay);

    slotSourcesRef.current[slotIndex] = { source, gain };
    setSlots((current) => current.map((currentSlot, index) => (
      index === slotIndex ? { ...currentSlot, isPlaying: true } : currentSlot
    )));
  }, [activeDeck.currentTime, masterBpm, slots, stopSlot]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    slotSourcesRef.current.forEach((entry, slotIndex) => {
      if (!entry) return;
      const slot = slots[slotIndex];
      const targetRate = Math.max(0.5, Math.min(2, masterBpm / Math.max(1, slot.sourceBpm)));
      entry.source.playbackRate.setTargetAtTime(targetRate, engine.context.currentTime, 0.01);
    });
  }, [masterBpm, slots]);

  return (
    <section className="deck-chassis rounded-xl border border-studio-gold/20 p-2.5 md:p-3 shadow-2xl">
      <div className="mb-2 flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-studio-gold neon-text-glow">Remix Grid</p>
          <p className="oled-display text-[11px] text-slate-400">
            Capture a 4-bar loop from Deck {activeDeckId} and launch it against {masterBpm.toFixed(1)} BPM.
          </p>
        </div>
        <div className="oled-display rounded-lg border border-[#00FF00]/20 bg-black/50 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#00FF00]">
          Active Deck {activeDeckId}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {slots.map((slot, slotIndex) => (
          <div
            key={slotIndex}
            className="rounded-xl border border-studio-gold/15 bg-black/45 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="oled-display text-[11px] uppercase tracking-[0.2em] text-slate-300">Pad {slotIndex + 1}</span>
              <span className="oled-display text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {slot.deckId ? `D${slot.deckId} • ${slot.bars} Bars` : 'Empty'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => captureSlot(slotIndex)}
                className="mpc-pad neon-glow min-h-14 border border-studio-gold/30 text-[10px] font-black uppercase tracking-[0.16em] text-studio-gold"
              >
                Capture
              </button>
              <button
                type="button"
                disabled={!slot.buffer}
                onClick={() => (slot.isPlaying ? stopSlot(slotIndex) : triggerSlot(slotIndex))}
                className={clsx(
                  'mpc-pad min-h-14 border text-[10px] font-black uppercase tracking-[0.16em] transition-all',
                  slot.buffer
                    ? slot.isPlaying
                      ? 'mpc-pad-active border-[#00FF00] text-[#00FF00]'
                      : 'border-studio-crimson/40 text-studio-crimson hover:neon-glow'
                    : 'cursor-not-allowed border-white/10 text-slate-600'
                )}
              >
                {slot.isPlaying ? 'Stop' : 'Play'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
