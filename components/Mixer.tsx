'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AudioEngine } from '@/lib/audioEngine';
import { useMixerStore } from '@/store/mixerStore';
import { useDeckStore } from '@/store/deckStore';
import { useTrackCueStore } from '@/store/trackCueStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useUIStore } from '@/store/uiStore';
import { getCompatibleKeys } from '@/lib/harmonicKeys';
import { buildSessionState, ensureSessionSync, saveSessionState } from '@/lib/syncManager';
import { useMIDIManager } from '@/hooks/useMIDIManager';
import { buildAICrate } from '@/lib/aiCrate';
import { useShallow } from 'zustand/react/shallow';

type MeterTarget = 'A' | 'B' | 'Master';

/** Fraction of the FFT spectrum considered "low" (bass) for sparkline EQ display */
const EQ_LOW_THRESHOLD = 0.1;
/** Fraction of the FFT spectrum considered "mid" (upper boundary) for sparkline EQ display */
const EQ_MID_THRESHOLD = 0.5;
/** Sparkline circular buffer size — last N energy samples displayed per EQ band */
const SPARKLINE_HISTORY_SIZE = 8;
/** Energy levels for sparkline color transitions (green → yellow → red) */
const SPARKLINE_HIGH_ENERGY = 0.6;
const SPARKLINE_MID_ENERGY = 0.3;
/** Minimum beat-phase offset before the neural crossfader applies a correction */
const PHASE_ALIGNMENT_THRESHOLD = 0.01;
/** Fraction of the computed timing correction applied per frame (avoids oscillation) */
const PHASE_CORRECTION_DAMPING = 0.6;
const DEFAULT_AI_CRATE_PROMPT = 'Show me tracks for a 124 BPM house set.';
/** Shared className for compact column labels (Deck A / Vol A / Deck B / Vol B). */
const COMPACT_LABEL_CLS = 'text-[8px] uppercase tracking-[0.28em] text-center';
const DEFAULT_RECORDING_PROFILE = {
  sampleRate: 48000,
  bitDepth: 24,
};
const MasterMeter = dynamic(() => import('@/components/MasterMeter').then((module) => module.MasterMeter), {
  ssr: false,
});

const VUMeter = ({ deckId, compact = false }: { deckId: MeterTarget; compact?: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef<HTMLDivElement[]>([]);
  const peakRef = useRef(0);
  const peakTimerRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const ensureSegments = () => {
      const nodes = containerRef.current?.querySelectorAll<HTMLDivElement>('[data-seg]');
      if (nodes) segmentsRef.current = Array.from(nodes);
    };
    ensureSegments();

    const tick = () => {
      let level = 0;
      let peak = 0;
      if (deckId === 'Master') {
        const data = engine.getMasterEnergy();
        level = data.rms;
        peak = data.rms;
      } else {
        const data = engine.getDeckEnergy(deckId);
        level = data.rms;
        peak = data.peak;
      }

      // Falling peak physics
      if (peak > peakRef.current) {
        peakRef.current = peak;
        velocityRef.current = 0;
        peakTimerRef.current = 30; // ~500ms at 60fps
      } else {
        if (peakTimerRef.current > 0) {
          peakTimerRef.current -= 1;
        } else {
          velocityRef.current += 0.005;
          peakRef.current = Math.max(0, peakRef.current - velocityRef.current);
        }
      }

      const lit = Math.round(Math.min(1, level) * 12);
      const peakIndex = Math.min(11, Math.floor(peakRef.current * 12));

      segmentsRef.current.forEach((seg, idx) => {
        const color = idx >= 10 ? '#E11D48' : idx >= 8 ? '#D4AF37' : '#22c55e';
        const active = idx < lit || idx === peakIndex;
        seg.style.backgroundColor = color;
        seg.style.opacity = active ? (idx === peakIndex ? '1' : '0.9') : '0.1';
        seg.style.boxShadow = active ? `0 0 8px ${color}` : 'none';
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [deckId]);

  return (
    <div ref={containerRef} className={compact ? 'flex flex-col gap-0.5 h-24 w-3 bg-[#050505] border border-studio-gold/30 rounded-sm p-0.5' : 'flex flex-col gap-0.5 h-32 w-4 bg-[#050505] border border-studio-gold/30 rounded-sm p-0.5'}>
      {Array.from({ length: 12 }).map((_, idx) => (
        <div
          key={idx}
          data-seg
          className="flex-1 rounded-[2px] transition-[opacity] duration-75"
          style={{ backgroundColor: '#0f172a', opacity: 0.1 }}
        />
      ))}
    </div>
  );
};

// ── EQ Knob with optional sparkline canvas ──────────────────────────────────
function EQKnob({
  label,
  value,
  onChange,
  sparklineCanvasRef,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  sparklineCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    let newValue = startValue.current + deltaY / 50;
    newValue = Math.max(-1, Math.min(1, newValue));
    onChange(newValue);
  }, [onChange]);

  function handleMouseUp() {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = () => {
    onChange(0);
    navigator.vibrate?.(10);
  };

  // Rotation from -135deg to +135deg
  const rotation = value * 135;

  return (
    <div className="flex flex-col gap-2 items-center">
      <div
        className="w-8 h-8 rounded-full bg-studio-slate border border-studio-gold/40 relative cursor-ns-resize group shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Sparkline canvas — behind knob body, low opacity */}
        {sparklineCanvasRef && (
          <canvas
            ref={sparklineCanvasRef}
            width={28}
            height={28}
            className="absolute inset-0 w-full h-full rounded-full pointer-events-none z-0"
            style={{ opacity: 0.45 }}
          />
        )}

        {/* Active Arc Visual Feedback */}
        <div
          className="absolute -inset-1 rounded-full opacity-50 transition-opacity pointer-events-none z-[5]"
          style={{
            background:
              value > 0
                ? `conic-gradient(from 0deg, #D4AF37 0deg, #D4AF37 ${value * 135}deg, transparent ${value * 135}deg)`
                : value < 0
                ? `conic-gradient(from 0deg, transparent 0deg, transparent ${360 + value * 135}deg, #E11D48 ${
                    360 + value * 135
                  }deg, #E11D48 360deg)`
                : 'transparent',
          }}
        ></div>

        {/* Knob Body */}
        <div className="absolute inset-0 rounded-full bg-studio-black z-10 border border-studio-gold/40"></div>

        {/* Indicator */}
        <div
          className="absolute inset-0 z-20"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div
            className={`absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 rounded-full ${
              value === 0 ? 'bg-slate-400' : value > 0 ? 'bg-studio-gold shadow-[0_0_5px_#D4AF37]' : 'bg-studio-crimson shadow-[0_0_5px_#E11D48]'
            }`}
          ></div>
        </div>
      </div>
      <span className="text-[9px] uppercase text-center text-slate-500">{label}</span>
    </div>
  );
}

// ── Mix Opportunity Badge ───────────────────────────────────────────────────
function MixOpportunityBadge() {
  const { keyA, keyB } = useDeckStore(
    useShallow((state) => ({
      keyA: state.deckA.track?.key ?? '',
      keyB: state.deckB.track?.key ?? '',
    }))
  );

  if (!keyA || !keyB) return null;

  const compatible = getCompatibleKeys(keyA.toUpperCase());
  const isMatch = compatible.includes(keyB.toUpperCase());

  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider border ${
        isMatch
          ? 'bg-green-900/30 border-green-500/40 text-green-400'
          : 'bg-slate-900/40 border-slate-600/30 text-slate-600'
      }`}
    >
      <span>{isMatch ? '✓' : '✗'}</span>
      <span>{isMatch ? 'KEY MATCH' : 'KEY CLASH'}</span>
    </div>
  );
}

export function Mixer({ compact = false }: Readonly<{ compact?: boolean }>) {
  const { eqA, eqB, volA, volB, crossfader, crossfaderCurve, vaultAmbience, setEQ, setVolume, setCrossfader, setCrossfaderCurve, setVaultAmbience } = useMixerStore();
  const cuesByTrack = useTrackCueStore((state) => state.cuesByTrack);
  const deckAState = useDeckStore((state) => state.deckA);
  const deckBState = useDeckStore((state) => state.deckB);
  const libraryTracks = useLibraryStore((state) => state.tracks);
  const { isLibraryVisible, toggleLibrary } = useUIStore(
    useShallow((state) => ({
      isLibraryVisible: state.isLibraryVisible,
      toggleLibrary: state.toggleLibrary,
    }))
  );
  const {
    isSupported: isMIDISupported,
    isConnecting: isMIDIConnecting,
    isConnected: isMIDIConnected,
    devices: midiDevices,
    lastMessage,
    connect: connectMIDI,
  } = useMIDIManager();
  const [killA, setKillA] = useState<{ high: boolean; mid: boolean; low: boolean }>({ high: false, mid: false, low: false });
  const [killB, setKillB] = useState<{ high: boolean; mid: boolean; low: boolean }>({ high: false, mid: false, low: false });

  const toggleKill = useCallback((deckId: 'A' | 'B', band: 'high' | 'mid' | 'low') => {
    if (deckId === 'A') {
      setKillA((prev) => {
        const nextKilled = !prev[band];
        setEQ('A', band, nextKilled ? -1 : 0);
        return { ...prev, [band]: nextKilled };
      });
    } else {
      setKillB((prev) => {
        const nextKilled = !prev[band];
        setEQ('B', band, nextKilled ? -1 : 0);
        return { ...prev, [band]: nextKilled };
      });
    }
  }, [setEQ]);

  const [cratePrompt, setCratePrompt] = useState(DEFAULT_AI_CRATE_PROMPT);
  const [isMainstage, setIsMainstage] = useState(false);
  const restoreLibraryRef = useRef(false);
  const aiCrate = useMemo(() => buildAICrate(libraryTracks, cratePrompt, { limit: compact ? 3 : 5, vaultOnly: true }), [compact, cratePrompt, libraryTracks]);
  const recordingProfile = useMemo(() => (
    typeof window === 'undefined'
      ? DEFAULT_RECORDING_PROFILE
      : AudioEngine.getInstance().getRecordingProfile()
  ), []);

  useEffect(() => {
    ensureSessionSync();
  }, []);

  // ── Chassis pulse ref ───────────────────────────────────────────────────
  const mixerOuterRef = useRef<HTMLDivElement>(null);
  const chassisPulseRafRef = useRef<number | null>(null);

  // ── EQ Sparkline canvas refs (A: high/mid/low, B: high/mid/low) ──────────
  const sparklineAHighRef = useRef<HTMLCanvasElement | null>(null);
  const sparklineAMidRef = useRef<HTMLCanvasElement | null>(null);
  const sparklineALowRef = useRef<HTMLCanvasElement | null>(null);
  const sparklineBHighRef = useRef<HTMLCanvasElement | null>(null);
  const sparklineBMidRef = useRef<HTMLCanvasElement | null>(null);
  const sparklineBLowRef = useRef<HTMLCanvasElement | null>(null);

  // Circular history buffers for EQ sparklines (SPARKLINE_HISTORY_SIZE samples each)
  const freqHistoryRef = useRef({
    aHigh: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    aMid: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    aLow: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    bHigh: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    bMid: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    bLow: new Array<number>(SPARKLINE_HISTORY_SIZE).fill(0),
    writeIdx: 0,
  });

  const isDraggingCrossfader = useRef(false);
  const crossfaderRef = useRef<HTMLDivElement>(null);

  const isDraggingVolA = useRef(false);
  const isDraggingVolB = useRef(false);
  const volARef = useRef<HTMLDivElement>(null);
  const volBRef = useRef<HTMLDivElement>(null);

  const setVolumeFromClientY = useCallback((deckId: 'A' | 'B', clientY: number) => {
    const ref = deckId === 'A' ? volARef.current : volBRef.current;
    if (!ref) return;
    const rect = ref.getBoundingClientRect();
    const y = Math.max(rect.top, Math.min(clientY, rect.bottom));
    const ratio = (rect.bottom - y) / rect.height;
    setVolume(deckId, ratio);
  }, [setVolume]);

  const handleCrossfaderMove = useCallback((e: PointerEvent) => {
    if (!isDraggingCrossfader.current || !crossfaderRef.current) return;
    const rect = crossfaderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let newValue = (x / rect.width) * 2 - 1;
    newValue = Math.max(-1, Math.min(1, newValue));
    setCrossfader(newValue);
  }, [setCrossfader]);

  function handleCrossfaderUp() {
    isDraggingCrossfader.current = false;
    document.removeEventListener('pointermove', handleCrossfaderMove);
    document.removeEventListener('pointerup', handleCrossfaderUp);
  }

  const handleCrossfaderDown = (e: React.PointerEvent) => {
    isDraggingCrossfader.current = true;
    document.addEventListener('pointermove', handleCrossfaderMove);
    document.addEventListener('pointerup', handleCrossfaderUp);
    // Also update immediately on click
    if (crossfaderRef.current) {
      const rect = crossfaderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let newValue = (x / rect.width) * 2 - 1;
      newValue = Math.max(-1, Math.min(1, newValue));
      setCrossfader(newValue);
    }
  };

  const handleCrossfaderDoubleClick = () => {
    setCrossfader(0);
    navigator.vibrate?.(10);
  };

  const stopVolDrag = useCallback(() => {
    isDraggingVolA.current = false;
    isDraggingVolB.current = false;
  }, []);

  const handleVolMove = useCallback((e: PointerEvent) => {
    if (isDraggingVolA.current) setVolumeFromClientY('A', e.clientY);
    if (isDraggingVolB.current) setVolumeFromClientY('B', e.clientY);
  }, [setVolumeFromClientY]);

  useEffect(() => {
    window.addEventListener('pointermove', handleVolMove);
    window.addEventListener('pointerup', stopVolDrag);
    return () => {
      window.removeEventListener('pointermove', handleVolMove);
      window.removeEventListener('pointerup', stopVolDrag);
    };
  }, [handleVolMove, stopVolDrag]);

  const startVolDrag = (deckId: 'A' | 'B') => (e: React.PointerEvent) => {
    if (deckId === 'A') isDraggingVolA.current = true;
    else isDraggingVolB.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setVolumeFromClientY(deckId, e.clientY);
  };

  // ── Chassis Pulse + EQ Sparkline RAF ────────────────────────────────────
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const masterBufLen = engine.masterAnalyser.frequencyBinCount;
    const masterFreqData = new Uint8Array(masterBufLen);

    const drawSparkline = (canvas: HTMLCanvasElement | null, history: number[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barW = width / history.length;
      history.forEach((val, i) => {
        const barH = Math.max(1, val * height);
        const hue = val > SPARKLINE_HIGH_ENERGY ? 0 : val > SPARKLINE_MID_ENERGY ? 45 : 120;
        ctx.fillStyle = `hsla(${hue}, 90%, 55%, 0.8)`;
        ctx.fillRect(i * barW, height - barH, barW - 1, barH);
      });
    };

    const readBands = (freqData: Uint8Array, bufLen: number) => {
      const segment = (start: number, end: number) => {
        let sum = 0;
        const count = end - start;
        for (let i = start; i < end; i++) sum += freqData[i] / 255;
        return count > 0 ? sum / count : 0;
      };
      const lowBoundary = Math.floor(bufLen * EQ_LOW_THRESHOLD);
      const midBoundary = Math.floor(bufLen * EQ_MID_THRESHOLD);
      return {
        low: segment(0, lowBoundary),
        mid: segment(lowBoundary, midBoundary),
        high: segment(midBoundary, bufLen),
      };
    };

    const tick = () => {
      engine.masterAnalyser.getByteFrequencyData(masterFreqData);
      const masterBands = readBands(masterFreqData, masterBufLen);

      // Per-deck analysers for deck-specific sparklines
      const analyserA = engine.getDeckAnalyser('A');
      const analyserB = engine.getDeckAnalyser('B');

      const deckABands = (() => {
        if (!analyserA) return masterBands;
        const d = new Uint8Array(analyserA.frequencyBinCount);
        analyserA.getByteFrequencyData(d);
        return readBands(d, d.length);
      })();

      const deckBBands = (() => {
        if (!analyserB) return masterBands;
        const d = new Uint8Array(analyserB.frequencyBinCount);
        analyserB.getByteFrequencyData(d);
        return readBands(d, d.length);
      })();

      // Write into circular buffers
      const h = freqHistoryRef.current;
      const idx = h.writeIdx;
      h.aLow[idx] = deckABands.low;
      h.aMid[idx] = deckABands.mid;
      h.aHigh[idx] = deckABands.high;
      h.bLow[idx] = deckBBands.low;
      h.bMid[idx] = deckBBands.mid;
      h.bHigh[idx] = deckBBands.high;
      h.writeIdx = (idx + 1) % SPARKLINE_HISTORY_SIZE;

      // Re-order history for display (oldest first)
      const ordered = (arr: number[]) => {
        const startIdx = h.writeIdx;
        return [...arr.slice(startIdx), ...arr.slice(0, startIdx)];
      };

      drawSparkline(sparklineAHighRef.current, ordered(h.aHigh));
      drawSparkline(sparklineAMidRef.current, ordered(h.aMid));
      drawSparkline(sparklineALowRef.current, ordered(h.aLow));
      drawSparkline(sparklineBHighRef.current, ordered(h.bHigh));
      drawSparkline(sparklineBMidRef.current, ordered(h.bMid));
      drawSparkline(sparklineBLowRef.current, ordered(h.bLow));

      // Chassis pulse: drive outer div box-shadow from low-freq energy
      if (mixerOuterRef.current) {
        const glow = Math.round(masterBands.low * 30);
        const alpha = (0.05 + masterBands.low * 0.35).toFixed(2);
        mixerOuterRef.current.style.boxShadow = `0 0 ${10 + glow}px rgba(255,215,0,${alpha}), 0 10px 10px rgba(0,0,0,0.6)`;
      }

      chassisPulseRafRef.current = requestAnimationFrame(tick);
    };

    chassisPulseRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (chassisPulseRafRef.current) cancelAnimationFrame(chassisPulseRafRef.current);
    };
  }, []);

  useEffect(() => {
    AudioEngine.getInstance().setVaultAmbience(vaultAmbience);
  }, [vaultAmbience]);

  useEffect(() => {
    if (isMainstage) {
      restoreLibraryRef.current = isLibraryVisible;
      if (isLibraryVisible) {
        toggleLibrary();
      }
      return;
    }

    if (restoreLibraryRef.current && !isLibraryVisible) {
      toggleLibrary();
    }
    restoreLibraryRef.current = false;
  }, [isLibraryVisible, isMainstage, toggleLibrary]);

  useEffect(() => {
    if (crossfaderCurve !== 'neural') {
      return undefined;
    }

    const engine = AudioEngine.getInstance();
    let rafId: number;

    const tick = () => {
      const { deckA, deckB } = useDeckStore.getState();
      const bpmA = Number(deckA.track?.bpm);
      const bpmB = Number(deckB.track?.bpm);
      if (!deckA.isPlaying || !deckB.isPlaying || !Number.isFinite(bpmA) || !Number.isFinite(bpmB) || bpmA <= 0 || bpmB <= 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const secPerBeatA = 60 / bpmA;
      const secPerBeatB = 60 / bpmB;
      const phaseA = ((deckA.currentTime / secPerBeatA) % 1 + 1) % 1;
      const phaseB = ((deckB.currentTime / secPerBeatB) % 1 + 1) % 1;
      let phaseDelta = phaseB - phaseA;
      if (phaseDelta > 0.5) phaseDelta -= 1;
      if (phaseDelta < -0.5) phaseDelta += 1;
      if (Math.abs(phaseDelta) >= PHASE_ALIGNMENT_THRESHOLD) {
        const targetDeck = crossfader <= 0 ? 'B' : 'A';
        const targetState = targetDeck === 'A' ? deckA : deckB;
        const baseRate = Math.max(0.5, Math.min(2.0, 1 + targetState.pitchPercent / 100));
        const correctionWindow = Math.min(0.005, Math.abs(phaseDelta) * Math.min(secPerBeatA, secPerBeatB));
        const correctedRate = baseRate + (phaseDelta > 0 ? -1 : 1) * correctionWindow * PHASE_CORRECTION_DAMPING;
        engine.setDeckPlaybackRate(targetDeck, correctedRate);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      const { deckA, deckB } = useDeckStore.getState();
      engine.setDeckPlaybackRate('A', Math.max(0.5, Math.min(2.0, 1 + deckA.pitchPercent / 100)));
      engine.setDeckPlaybackRate('B', Math.max(0.5, Math.min(2.0, 1 + deckB.pitchPercent / 100)));
    };
  }, [crossfader, crossfaderCurve]);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      saveSessionState(buildSessionState({
        deckA: deckAState,
        deckB: deckBState,
        mixer: {
          crossfader,
          crossfaderCurve,
          vaultAmbience,
          volumes: {
            A: volA,
            B: volB,
          },
        },
        cuesByTrack,
      }));
    }, 120);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [crossfader, crossfaderCurve, cuesByTrack, deckAState, deckBState, vaultAmbience, volA, volB]);

  // Map crossfader value (-1 to 1) to left percentage (0% to 100%)
  const crossfaderLeft = `${((crossfader + 1) / 2) * 100}%`;

  // Map volume (0..1) to top offset within fader track
  const volATop = `${(1 - volA) * 100}%`;
  const volBTop = `${(1 - volB) * 100}%`;

  const handleAmbienceChange = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVaultAmbience(clamped);
    AudioEngine.getInstance().setVaultAmbience(clamped);
  };

  return (
    <div
      ref={mixerOuterRef}
      className={compact ? 'h-full deck-chassis rounded-xl border border-studio-gold/20 p-2 flex flex-col items-center gap-3 transition-colors duration-300 touch-none select-none shadow-2xl overflow-hidden' : 'deck-chassis rounded-xl border border-studio-gold/20 p-3 flex flex-col items-center gap-4 transition-colors duration-300 touch-none select-none shadow-2xl'}
    >
      <div className={compact ? 'w-full rounded-xl border border-studio-gold/20 bg-black/50 p-2' : 'w-full rounded-xl border border-studio-gold/20 bg-black/45 p-3'}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] uppercase tracking-[0.3em] text-studio-gold/80">AI Prompter Crate</p>
            <input
              value={cratePrompt}
              onChange={(event) => setCratePrompt(event.target.value)}
              placeholder={DEFAULT_AI_CRATE_PROMPT}
              className="mt-2 w-full rounded-lg border border-studio-gold/20 bg-[#050505] px-3 py-2 text-[11px] text-slate-100 outline-none transition focus:border-studio-gold focus:shadow-[0_0_12px_rgba(255,215,0,0.2)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsMainstage((current) => !current)}
            className={isMainstage
              ? 'self-start rounded-full border border-studio-crimson bg-studio-crimson/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[0_0_14px_rgba(255,0,60,0.35)]'
              : 'self-start rounded-full border border-studio-gold/30 bg-studio-gold/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-studio-gold'}
          >
            {isMainstage ? 'Exit Mainstage' : 'Mainstage'}
          </button>
        </div>
        <div className={compact ? 'mt-2 flex flex-col gap-2' : 'mt-3 flex flex-col gap-3'}>
          <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-slate-400">
            {isMIDISupported ? (
              <button
                type="button"
                onClick={() => void connectMIDI()}
                disabled={isMIDIConnecting}
                className={isMIDIConnected
                  ? 'rounded-full border border-studio-gold/40 bg-studio-gold/10 px-2 py-1 text-studio-gold'
                  : 'rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300 transition hover:border-studio-gold/30 hover:text-studio-gold disabled:opacity-60'}
              >
                {isMIDIConnecting ? 'Connecting MIDI' : isMIDIConnected ? `Reconnect MIDI (${midiDevices.length})` : 'Connect MIDI'}
              </button>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">MIDI Unavailable</span>
            )}
            {lastMessage ? <span className="oled-display text-[9px] text-slate-300">{lastMessage}</span> : null}
          </div>
          <div className="grid gap-2">
            {aiCrate.matches.length > 0 ? aiCrate.matches.map(({ track, reasons, score }) => (
              <div key={`${track.sourceId ?? track.id ?? track.title}-${score}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-100">{track.title}</p>
                  <p className="truncate text-[9px] uppercase tracking-[0.18em] text-slate-500">{track.artist} • {track.bpm} BPM • {track.key}</p>
                </div>
                <div className="text-right">
                  <p className="oled-display text-[10px] text-studio-gold">{Math.round(score)}</p>
                  <p className="max-w-[140px] text-[8px] uppercase tracking-[0.16em] text-slate-500">{reasons.join(' • ')}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                No vault matches yet. Try a BPM, key like 8A, or artist prompt.
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={compact ? 'grid grid-cols-2 gap-3 w-full' : 'grid grid-cols-2 gap-4 w-full'}>
        {compact && (
          <>
            <p className={`${COMPACT_LABEL_CLS} text-studio-gold/70`}>Deck A</p>
            <p className={`${COMPACT_LABEL_CLS} text-studio-crimson/70`}>Deck B</p>
          </>
        )}
        <div className={compact ? 'flex flex-col items-center gap-2' : 'flex flex-col items-center gap-2'}>
          <EQKnob label="High" value={eqA.high} onChange={(val) => setEQ('A', 'high', val)} sparklineCanvasRef={sparklineAHighRef} />
          <EQKnob label="Mid" value={eqA.mid} onChange={(val) => setEQ('A', 'mid', val)} sparklineCanvasRef={sparklineAMidRef} />
          <EQKnob label="Low" value={eqA.low} onChange={(val) => setEQ('A', 'low', val)} sparklineCanvasRef={sparklineALowRef} />
          <div className="flex gap-1 mt-1">
            {(['high', 'mid', 'low'] as const).map((band) => (
              <button
                key={band}
                type="button"
                title={`Kill ${band} EQ (Deck A)`}
                onClick={() => toggleKill('A', band)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide border transition-all ${
                  killA[band]
                    ? 'bg-studio-crimson border-studio-crimson text-white shadow-[0_0_8px_#FF003C]'
                    : 'bg-studio-black border-studio-gold/30 text-slate-500 hover:border-studio-crimson/50 hover:text-slate-300'
                }`}
              >
                {band[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className={compact ? 'flex flex-col items-center gap-2' : 'flex flex-col items-center gap-2'}>
          <EQKnob label="High" value={eqB.high} onChange={(val) => setEQ('B', 'high', val)} sparklineCanvasRef={sparklineBHighRef} />
          <EQKnob label="Mid" value={eqB.mid} onChange={(val) => setEQ('B', 'mid', val)} sparklineCanvasRef={sparklineBMidRef} />
          <EQKnob label="Low" value={eqB.low} onChange={(val) => setEQ('B', 'low', val)} sparklineCanvasRef={sparklineBLowRef} />
          <div className="flex gap-1 mt-1">
            {(['high', 'mid', 'low'] as const).map((band) => (
              <button
                key={band}
                type="button"
                title={`Kill ${band} EQ (Deck B)`}
                onClick={() => toggleKill('B', band)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide border transition-all ${
                  killB[band]
                    ? 'bg-studio-crimson border-studio-crimson text-white shadow-[0_0_8px_#FF003C]'
                    : 'bg-studio-black border-studio-gold/30 text-slate-500 hover:border-studio-crimson/50 hover:text-slate-300'
                }`}
              >
                {band[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      {compact ? (
        /* Compact: 2-column symmetrical fader grid, no decorative LED bars */
        <div className="grid grid-cols-2 gap-3 w-full px-1">
          <div className="flex flex-col items-center gap-1">
            <span className={`${COMPACT_LABEL_CLS} text-studio-gold/60`}>Vol A</span>
            <div className="flex items-center gap-2">
              <VUMeter deckId="A" compact />
              <div
                ref={volARef}
                className="w-5 h-24 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
                onPointerDown={startVolDrag('A')}
                onDoubleClick={() => setVolume('A', 0.75)}
              >
                <div
                  className="absolute left-0 right-0 h-6 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
                  style={{ top: volATop, transform: 'translateY(-50%)' }}
                >
                  <div className="w-4 h-0.5 bg-studio-black" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className={`${COMPACT_LABEL_CLS} text-studio-crimson/60`}>Vol B</span>
            <div className="flex items-center gap-2">
              <div
                ref={volBRef}
                className="w-5 h-24 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
                onPointerDown={startVolDrag('B')}
                onDoubleClick={() => setVolume('B', 0.75)}
              >
                <div
                  className="absolute left-0 right-0 h-6 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
                  style={{ top: volBTop, transform: 'translateY(-50%)' }}
                >
                  <div className="w-4 h-0.5 bg-studio-black" />
                </div>
              </div>
              <VUMeter deckId="B" compact />
            </div>
          </div>
        </div>
      ) : (
        /* Desktop: original layout */
        <div className="flex justify-center gap-4 w-full px-2">
          <VUMeter deckId="A" compact={compact} />
          <div
            ref={volARef}
            className="w-6 h-32 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
            onPointerDown={startVolDrag('A')}
            onDoubleClick={() => setVolume('A', 0.75)}
          >
            <div
              className="absolute left-0 right-0 h-8 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
              style={{ top: volATop, transform: 'translateY(-50%)' }}
            >
              <div className="w-4 h-0.5 bg-studio-black"></div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 justify-between py-2">
              <div className="w-1.5 h-1 bg-red-500"></div>
              <div className="w-1.5 h-1 bg-yellow-500"></div>
              <div className="w-1.5 h-1 bg-yellow-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
            </div>
            <div className="flex flex-col gap-1 justify-between py-2">
              <div className="w-1.5 h-1 bg-red-500"></div>
              <div className="w-1.5 h-1 bg-yellow-500"></div>
              <div className="w-1.5 h-1 bg-yellow-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
              <div className="w-1.5 h-1 bg-green-500"></div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div
              ref={volBRef}
              className="w-6 h-32 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
              onPointerDown={startVolDrag('B')}
              onDoubleClick={() => setVolume('B', 0.75)}
            >
              <div
                className="absolute left-0 right-0 h-8 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
                style={{ top: volBTop, transform: 'translateY(-50%)' }}
              >
                <div className="w-4 h-0.5 bg-studio-black"></div>
              </div>
            </div>
          </div>
          <VUMeter deckId="B" compact={compact} />
        </div>
      )}
      <div className={compact ? 'w-full px-1 mt-auto' : 'w-full px-2 mt-auto'}>
        {/* Mix Opportunity Badge */}
        <div className="flex justify-center mb-2">
          <MixOpportunityBadge />
        </div>
        <div
          className={compact ? 'h-7 w-full fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]' : 'h-8 w-full fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]'}
          ref={crossfaderRef}
          onPointerDown={handleCrossfaderDown}
          onDoubleClick={handleCrossfaderDoubleClick}
        >
          <div
            className={compact ? 'absolute top-0 bottom-0 w-8 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] flex items-center justify-center' : 'absolute top-0 bottom-0 w-10 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] flex items-center justify-center'}
            style={{ left: crossfaderLeft, transform: 'translateX(-50%)' }}
          >
            <div className="h-4 w-0.5 bg-studio-black pointer-events-none"></div>
          </div>
        </div>
        <div className={compact ? 'mt-2 flex flex-col items-center gap-1.5' : 'mt-3 flex flex-col items-center gap-2'}>
          <div className="inline-flex rounded-full bg-studio-black p-1 border border-studio-gold/30 text-[9px]">
            <button
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                crossfaderCurve === 'blend'
                  ? 'bg-studio-gold text-studio-black shadow-[0_0_8px_#D4AF37]'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              onClick={() => setCrossfaderCurve('blend')}
            >
              Blend
            </button>
            <button
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                crossfaderCurve === 'cut'
                  ? 'bg-studio-gold text-studio-black shadow-[0_0_8px_#D4AF37]'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              onClick={() => setCrossfaderCurve('cut')}
            >
              Cut
            </button>
            <button
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                crossfaderCurve === 'neural'
                  ? 'bg-studio-crimson text-white shadow-[0_0_12px_#FF003C]'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              onClick={() => setCrossfaderCurve('neural')}
            >
              Neural
            </button>
          </div>
          <p className="text-[8px] uppercase tracking-widest text-center text-slate-500">
            Crossfader ({crossfaderCurve === 'blend' ? 'Equal Power' : crossfaderCurve === 'cut' ? 'Scratch Cut' : 'Smart Fade'})
          </p>
        </div>
        <div className="mt-5 w-full flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-studio-black border border-studio-gold/30 relative overflow-hidden cursor-pointer"
               onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  handleAmbienceChange((e.clientX - rect.left) / rect.width);
                }}>
            <div className="absolute inset-y-0 left-0 bg-studio-gold/80 shadow-[0_0_10px_#D4AF37]" style={{ width: `${vaultAmbience * 100}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-300">
            Vault Ambience
            <span className="oled-display text-studio-gold">{Math.round(vaultAmbience * 100)}%</span>
          </div>
        </div>
        {isMainstage ? (
          <div className="mt-4 w-full rounded-2xl border border-studio-crimson/40 bg-[radial-gradient(circle_at_top,rgba(255,0,60,0.18),rgba(0,0,0,0.92))] px-4 py-5 shadow-[0_0_32px_rgba(255,0,60,0.16)]">
            <div className="mb-4 text-center">
              <p className="text-[9px] uppercase tracking-[0.35em] text-studio-crimson">Mainstage Master</p>
              <p className="oled-display mt-2 text-sm text-studio-gold">
                Limiter Tap • {Math.round(recordingProfile.sampleRate / 1000)}kHz / {recordingProfile.bitDepth}-bit
              </p>
            </div>
            <div className="flex items-end justify-center gap-5">
              <VUMeter deckId="Master" compact={compact} />
              <div className="rounded-2xl border border-studio-gold/20 bg-black/40 px-6 py-4 shadow-[0_0_24px_rgba(255,215,0,0.12)]">
                <div className="scale-[1.45]">
                  <MasterMeter />
                </div>
              </div>
              <VUMeter deckId="Master" compact={compact} />
            </div>
          </div>
        ) : (
          <div className="mt-4 flex justify-center">
            <MasterMeter />
          </div>
        )}
      </div>
    </div>
  );
}
