'use client';

import { Play, Disc3, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useCallback, DragEvent, useRef, useEffect, useId, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeckStore } from '@/store/deckStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useUIStore } from '@/store/uiStore';
import { broadcastCue } from '@/lib/syncManager';
import { getCueTrackHash, useTrackCueStore } from '@/store/trackCueStore';
import { useDeckAudio } from '@/hooks/useDeckAudio';
import { usePerformanceKeys } from '@/hooks/usePerformanceKeys';
import { usePerformanceFX } from '@/hooks/usePerformanceFX';
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
import { OverviewWaveform } from '@/components/OverviewWaveform';
import { PerformancePads } from '@/components/deck/PerformancePads';
import { PitchFader } from '@/components/deck/PitchFader';
import { FXRack } from '@/components/deck/FXRack';
import { AudioEngine } from '@/lib/audioEngine';
import { MagneticButton } from '@/components/ui/MagneticButton';
import type { Track } from '@/lib/db';

interface DeckProps {
  deckId: 'A' | 'B';
  compact?: boolean;
}

/** Seconds for one full platter revolution at 1× (normal) playback speed (33⅓ RPM ≈ 1.8 s/rev) */
const PLATTER_REVOLUTION_SECONDS = 1.8;

const isTrackPayload = (value: unknown): value is Track => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Track>;
  return typeof candidate.title === 'string' && typeof candidate.artist === 'string' && typeof candidate.bpm === 'string';
};

interface DeckTheme {
  primary: string;
  secondary: string;
  primaryRgb: string;
}

const DEFAULT_DECK_THEME: Record<'A' | 'B', DeckTheme> = {
  A: { primary: '#D4AF37', secondary: '#F59E0B', primaryRgb: '212,175,55' },
  B: { primary: '#E11D48', secondary: '#FB7185', primaryRgb: '225,29,72' },
};

// Waveform beat-sync pulse: base opacity at silence, scales up to 1.0 at peak volume
const WAVEFORM_BASE_OPACITY = 0.7;
const WAVEFORM_OPACITY_RANGE = 0.3; // base + range = 1.0 at maximum volumeScale

const hexToRgbString = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => `${c}${c}`).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r},${g},${b}`;
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`;

const extractThemeFromArtwork = (image: HTMLImageElement): DeckTheme | null => {
  const canvas = document.createElement('canvas');
  const size = 80;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  let bestSat = -1;
  let accent = { r: 212, g: 175, b: 55 };

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 120) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum < 24 || lum > 235) continue;

    totalR += r;
    totalG += g;
    totalB += b;
    count += 1;

    if (sat > bestSat && lum > 40 && lum < 210) {
      bestSat = sat;
      accent = { r, g, b };
    }
  }

  if (count === 0) return null;
  const baseR = totalR / count;
  const baseG = totalG / count;
  const baseB = totalB / count;

  const boostedPrimary = {
    r: Math.min(255, baseR * 1.12 + 12),
    g: Math.min(255, baseG * 1.12 + 12),
    b: Math.min(255, baseB * 1.12 + 12),
  };

  return {
    primary: rgbToHex(boostedPrimary.r, boostedPrimary.g, boostedPrimary.b),
    secondary: rgbToHex(accent.r, accent.g, accent.b),
    primaryRgb: `${Math.round(boostedPrimary.r)},${Math.round(boostedPrimary.g)},${Math.round(boostedPrimary.b)}`,
  };
};

export function Deck({ deckId, compact = false }: Readonly<DeckProps>) {
  const loadTrack = useDeckStore((state) => state.loadTrack);
  const ejectTrack = useDeckStore((state) => state.ejectTrack);
  const setPitch = useDeckStore((state) => state.setPitch);
  const toggleSync = useDeckStore((state) => state.toggleSync);
  const toggleKeyLock = useDeckStore((state) => state.toggleKeyLock);
  const pitchPercent = useDeckStore((state) => (deckId === 'A' ? state.deckA.pitchPercent : state.deckB.pitchPercent));
  const sync = useDeckStore((state) => (deckId === 'A' ? state.deckA.sync : state.deckB.sync));
  const keyLock = useDeckStore((state) => (deckId === 'A' ? state.deckA.keyLock : state.deckB.keyLock));
  const keyLockSupported = useDeckStore((state) => (deckId === 'A' ? state.deckA.keyLockSupported : state.deckB.keyLockSupported));
  const stems = useDeckStore((state) => (deckId === 'A' ? state.deckA.stems : state.deckB.stems));
  const toggleStem = useDeckStore((state) => state.toggleStem);
  const { tracks } = useLibraryStore();
  const { currentTime, duration, isPlaying, isLoading, track, togglePlay, scrubTrack, endScrub, getAudioData } = useDeckAudio(deckId);
  const { volumeScale } = useAudioAnalyzer(deckId);
  const { setCue, clearCue, loadCues, getCues, autoGenerateCues } = useTrackCueStore();

  const [currentBpm, setCurrentBpm] = useState(track ? Number(track.bpm) : 120);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [bpmInputValue, setBpmInputValue] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isNudgingUp, setIsNudgingUp] = useState(false);
  const [isNudgingDown, setIsNudgingDown] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const [isMonitorCueEnabled, setIsMonitorCueEnabled] = useState(false);
  const [deckTheme, setDeckTheme] = useState<DeckTheme>(DEFAULT_DECK_THEME[deckId]);

  const cuePoints = useMemo(() => (track ? getCues(track) : []), [getCues, track]);

  useEffect(() => {
    if (track) {
      void loadCues(track);
    }
  }, [track, loadCues]);

  useEffect(() => {
    void AudioEngine.getInstance().createDeckFxBus(deckId);
  }, [deckId]);

  useEffect(() => {
    AudioEngine.getInstance().setDeckCueEnabled(deckId, isMonitorCueEnabled);
  }, [deckId, isMonitorCueEnabled]);

  useEffect(() => () => {
    // deckId is stable per Deck instance (A or B), so this cleanup effectively runs on unmount.
    AudioEngine.getInstance().setDeckCueEnabled(deckId, false);
  }, [deckId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scratchOffsetRef.current = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [track?.id]);

  const { padMode, setPadMode, handlePadHold, handlePadRelease, handleCueTimeHold, handleCueTimeRelease } = usePerformanceFX({
    deckId,
    track,
    cuePoints,
    currentTime,
    bpm: currentBpm,
    setCue,
  });

  const clearCueSlot = useCallback(async (slot: number) => {
    if (!track) return;
    await clearCue(track, slot);
    broadcastCue(getCueTrackHash(track), {
      slot,
      time: 0,
      type: 'hot',
      timestamp: Date.now(),
      color: '#00FF00',
      name: `Cue ${slot}`,
      deleted: true,
    });
  }, [track, clearCue]);

  const { shiftHeld, pressedSlots } = usePerformanceKeys({
    deckId,
     getCueTime: (slot) => {
       const existing = cuePoints.find((c) => c.slot === slot);
       return existing ? existing.time : null;
     },
     startStutter: handleCueTimeHold,
     stopStutter: handleCueTimeRelease,
     clearCue: (slot) => {
       void clearCueSlot(slot);
     },
   });

  const tapTimesRef = useRef<number[]>([]);
  const jogWheelRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const lastMoveTimeRef = useRef<number>(0);
  const lastDeltaRef = useRef<number>(0);
  const fallbackPlatterRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(currentTime);
  const scratchOffsetRef = useRef(0);
  const lastAudioReactiveFrameRef = useRef(0);

  // Deck specific identity colors and styling hooks
  const deckStroke = deckTheme.primary;

  const containerRef = useRef<HTMLDivElement>(null);
  const jogWheelDataRingRef = useRef<SVGCircleElement>(null);
  const titleGlowRef = useRef<HTMLHeadingElement>(null);
  const deckTitleId = useId();
  const dropDescriptionId = useId();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_DEBUG_DECK_EVENTS !== 'true') {
      return undefined;
    }

    const node = containerRef.current;
    if (!node) return undefined;

    const logFocusIn = (event: FocusEvent) => {
      console.debug(`[Deck ${deckId}] focus movement within deck container`, event.target);
    };

    const logKeyDown = (event: KeyboardEvent) => {
      console.debug(`[Deck ${deckId}] keydown within deck container`, event.key);
    };

    node.addEventListener('focusin', logFocusIn);
    node.addEventListener('keydown', logKeyDown, true);

    return () => {
      node.removeEventListener('focusin', logFocusIn);
      node.removeEventListener('keydown', logKeyDown, true);
    };
  }, [deckId]);

  useEffect(() => {
    if (!track?.artworkUrl) {
      setDeckTheme(DEFAULT_DECK_THEME[deckId]);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      const nextTheme = extractThemeFromArtwork(image);
      setDeckTheme(nextTheme ?? DEFAULT_DECK_THEME[deckId]);
    };
    image.onerror = () => {
      if (!cancelled) {
        setDeckTheme(DEFAULT_DECK_THEME[deckId]);
      }
    };
    image.src = track.artworkUrl;

    return () => {
      cancelled = true;
    };
  }, [track?.artworkUrl, deckId]);

  // Audio Reactive Visuals
  useEffect(() => {
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (timestamp - lastAudioReactiveFrameRef.current < 33) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      lastAudioReactiveFrameRef.current = timestamp;
      const audioData = getAudioData?.();

      if (audioData) {
         const { rms, low } = audioData;

         if (containerRef.current) {
            const shadowSpread = 15 + low * 40;
            const shadowOpacity = 0.2 + low * 0.5;
            containerRef.current.style.boxShadow = `0 0 ${shadowSpread}px rgba(${deckTheme.primaryRgb}, ${shadowOpacity})`;
         }

         if (titleGlowRef.current) {
            titleGlowRef.current.style.textShadow = `0 0 ${5 + rms * 20}px currentColor`;
            titleGlowRef.current.style.opacity = (0.7 + rms * 0.3).toString();
         }

         if (jogWheelDataRingRef.current) {
            const dashArray = 2 * Math.PI * 110;
            const fillAmount = Math.min(1, rms * 2.5);
            jogWheelDataRingRef.current.style.strokeDasharray = `${dashArray * fillAmount} ${dashArray}`;
            jogWheelDataRingRef.current.style.opacity = (0.3 + rms).toString();
         }
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [getAudioData, deckTheme.primaryRgb]);

  const getAngle = (e: React.PointerEvent | PointerEvent) => {
    if (!jogWheelRef.current) return 0;
    const rect = jogWheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = e.clientX - centerX;
    const y = e.clientY - centerY;
    return Math.atan2(y, x) * (180 / Math.PI);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastAngleRef.current = getAngle(e);
    lastMoveTimeRef.current = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const currentAngle = getAngle(e);
    let deltaAngle = currentAngle - lastAngleRef.current;

    // Handle wrap-around
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    // eslint-disable-next-line react-hooks/immutability -- hot-path scratch offset is intentionally kept in a mutable ref
    scratchOffsetRef.current += deltaAngle;
    lastAngleRef.current = currentAngle;
    const now = performance.now();
    lastDeltaRef.current = deltaAngle / Math.max(1, now - lastMoveTimeRef.current);
    lastMoveTimeRef.current = now;

    // Time delta: 33.333 RPM = PLATTER_REVOLUTION_SECONDS per revolution.
    // So deltaTime = deltaAngle / 360 * PLATTER_REVOLUTION_SECONDS
    const timeDelta = (deltaAngle / 360) * PLATTER_REVOLUTION_SECONDS;
    scrubTrack(timeDelta);

    // Subtle haptic feedback when scratching
    if (Math.abs(deltaAngle) > 2 && navigator.vibrate) {
      navigator.vibrate(2);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const velocity = lastDeltaRef.current;
    const start = performance.now();
    const durationMs = 200;
    const animateBrake = () => {
      const now = performance.now();
      const t = Math.min(1, (now - start) / durationMs);
      const delta = velocity * (1 - t) * 5;
      scratchOffsetRef.current += delta;
      if (t < 1) requestAnimationFrame(animateBrake);
      else endScrub();
    };
    requestAnimationFrame(animateBrake);
  };

  const handleTap = useCallback(() => {
    const now = Date.now();
    tapTimesRef.current = [...tapTimesRef.current, now].filter((t) => now - t < 3000);
    if (tapTimesRef.current.length < 2) return;

    const intervals: number[] = [];
    for (let i = 1; i < tapTimesRef.current.length; i++) {
      intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
    }
    const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const calculatedBpm = Math.round(60000 / averageInterval);
    setCurrentBpm(calculatedBpm);
  }, []);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const json = e.dataTransfer.getData('application/json');
    if (json) {
      try {
        const droppedTrack: unknown = JSON.parse(json);
        if (isTrackPayload(droppedTrack)) {
          loadTrack(deckId, droppedTrack);
          setCurrentBpm(Number(droppedTrack.bpm) || 120);
        }
      } catch {
        // Fallback: legacy numeric id support
        const trackId = e.dataTransfer.getData('text/plain');
        if (trackId) {
          const t = tracks.find((t) => t.id === Number(trackId));
          if (t) {
            loadTrack(deckId, t);
            setCurrentBpm(Number(t.bpm));
          }
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (Number.isNaN(seconds) || seconds < 0) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const title = track?.title || 'No Track Loaded';
  const artist = track?.artist || '';
  const bpm = track ? currentBpm : '--';
  const keySignature = track?.key || '--';
  const timeRemaining = track ? formatTime(duration - currentTime) : '00:00.00';

  const handleLoadTrack = useCallback(() => {
    const isCompactViewport = window.matchMedia('(orientation: landscape) and (max-height: 540px), (max-width: 767px)').matches;
    if (isCompactViewport) {
      useUIStore.getState().setActiveTab('LIBRARY');
    } else {
      const state = useUIStore.getState();
      if (!state.isLibraryVisible) {
        state.toggleLibrary();
      }
    }
  }, []);

  const handleOverviewScrub = useCallback(
    (targetTime: number) => {
      if (!duration || !track) return;
      const clamped = Math.max(0, Math.min(targetTime, duration));
      const delta = clamped - currentTime;
      if (Math.abs(delta) < 0.01) return;
      scrubTrack(delta);
    },
    [duration, track, currentTime, scrubTrack]
  );

  const handleNudgeUpStart = () => setIsNudgingUp(true);
  const handleNudgeUpEnd = () => setIsNudgingUp(false);
  const handleNudgeDownStart = () => setIsNudgingDown(true);
  const handleNudgeDownEnd = () => setIsNudgingDown(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      // currentTimeRef already advances using the engine's real, smoothed playbackRate,
      // so platter spin should derive from transport time only and add scratch as angle.
      const audioDegrees = (currentTimeRef.current / PLATTER_REVOLUTION_SECONDS) * 360;
      const jitterDegrees = !isPlaying ? Math.sin(performance.now() * 0.1) * 0.12 : 0;
      const totalDegrees = audioDegrees + scratchOffsetRef.current + jitterDegrees;
      const fallback = fallbackPlatterRef.current;
      if (fallback) {
        fallback.style.transform = `rotate(${totalDegrees}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  let temporaryPitch = 0;
  if (isNudgingUp) {
    temporaryPitch = 5;
  } else if (isNudgingDown) {
    temporaryPitch = -5;
  }
  const syncButtonClass = sync
    ? 'bg-studio-black text-slate-100'
    : 'bg-studio-slate border-studio-gold/30 text-slate-300';
  const playButtonClass = isPlaying
    ? 'text-slate-900'
    : 'bg-studio-slate border-studio-gold/30 text-slate-300';

  const renderJogWheel = () => (
    <div className="jogwheel-wrapper flex flex-col gap-4 items-center deck-chassis rounded-2xl p-4">
      <div className={compact ? 'relative h-36 w-36 sm:h-40 sm:w-40' : 'relative w-64 h-64'}>
          <div
            className="absolute inset-0 rounded-full border border-white/8 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.14)_0%,rgba(18,18,18,0.95)_38%,rgba(5,5,5,1)_70%,rgba(0,0,0,1)_100%)]"
            style={{ boxShadow: `inset 0 0 60px rgba(0,0,0,0.85), 0 0 30px rgba(${deckTheme.primaryRgb}, 0.2)` }}
          >
            <div
              ref={fallbackPlatterRef}
              className="absolute inset-[14px] rounded-full border border-white/10 bg-[repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08)_0px,rgba(255,255,255,0.02)_2px,rgba(0,0,0,0.55)_4px,rgba(0,0,0,0.9)_7px)]"
              style={{ transform: 'rotate(0deg)' }}
            >
              <div
                className="absolute inset-[20%] rounded-full border border-white/10 shadow-[0_0_20px_rgba(212,175,55,0.18)] overflow-hidden"
                style={{
                  backgroundImage: track?.artworkUrl
                    ? `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), rgba(255,255,255,0.04) 28%, transparent 30%), linear-gradient(135deg, ${deckTheme.primary}, ${deckTheme.secondary}), url(${track.artworkUrl})`
                    : `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), rgba(255,255,255,0.04) 28%, transparent 30%), linear-gradient(135deg, ${deckTheme.primary}, ${deckTheme.secondary})`,
                  backgroundSize: track?.artworkUrl ? 'auto, auto, cover' : 'auto, auto',
                  backgroundPosition: track?.artworkUrl ? 'center, center, center' : 'center, center',
                  backgroundBlendMode: track?.artworkUrl ? 'normal, normal, soft-light' : 'normal',
                  boxShadow: `0 0 20px rgba(${deckTheme.primaryRgb},0.22)`,
                }}
              >
                <div className="absolute inset-[34%] rounded-full border border-black/30 bg-black/75" />
              </div>
              <div className="absolute left-1/2 top-[10%] h-[18%] w-1 -translate-x-1/2 rounded-full bg-white/55 shadow-[0_0_10px_rgba(255,255,255,0.45)]" />
            </div>
            <div className="absolute inset-[8%] rounded-full border" style={{ borderColor: `rgba(${deckTheme.primaryRgb}, 0.2)` }} />
          </div>
        <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 256 256">
          <circle cx="128" cy="128" r="120" fill="transparent" stroke={`rgba(${deckTheme.primaryRgb}, 0.32)`} strokeWidth="3" />
          <circle
            cx="128"
            cy="128"
            r="110"
            fill="transparent"
            stroke={deckStroke}
            strokeWidth="4"
            strokeDasharray="0 1000"
            ref={jogWheelDataRingRef}
            className="opacity-30 transition-opacity"
          />
        </svg>
        <div
          ref={jogWheelRef}
          className="absolute inset-0 rounded-full border-4 overflow-hidden cursor-pointer touch-none"
          style={{
            borderColor: `rgba(${deckTheme.primaryRgb}, 0.55)`,
            boxShadow: `0 0 35px rgba(${deckTheme.primaryRgb}, 0.35)`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="absolute inset-4 rounded-full border border-white/5" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-6 h-1.5 rounded-sm bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)]" />
          </div>
          <div className="absolute inset-0 pointer-events-none">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: `rgba(${deckTheme.primaryRgb}, 0.9)`, borderTopColor: 'transparent' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section
      ref={containerRef}
      className={clsx(
        'deck-container deck-chassis rounded-xl border flex flex-col transition-colors duration-300 touch-none select-none shadow-2xl transform relative',
        compact ? 'deck-container--compact h-full gap-3 p-3.5' : 'gap-4 p-6',
        isDragOver
          ? "scale-[1.02] ring-2 ring-offset-0 ring-studio-gold border-transparent"
          : ""
      )}
      style={{
        borderColor: `rgba(${deckTheme.primaryRgb}, 0.25)`,
        ['--deck-primary' as string]: deckTheme.primary,
        ['--deck-primary-rgb' as string]: deckTheme.primaryRgb,
      }}
      aria-labelledby={deckTitleId}
      aria-describedby={dropDescriptionId}
      aria-busy={isLoading}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Glassmorphism background layer */}
      {track?.artworkUrl && (
        <div
          className="absolute inset-0 z-0 overflow-hidden rounded-xl pointer-events-none"
          aria-hidden="true"
        >
          <img
            src={track.artworkUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-15 blur-3xl scale-110"
          />
        </div>
      )}
      <p id={dropDescriptionId} className="sr-only">
        Drag and drop a track onto this deck to load it.
      </p>
      {!compact && (
        <div className="relative z-10" style={{ opacity: WAVEFORM_BASE_OPACITY + volumeScale * WAVEFORM_OPACITY_RANGE }}>
          <OverviewWaveform
            deckId={deckId}
            duration={duration}
            currentTime={currentTime}
            track={track}
            accentColor={deckStroke}
            compact={compact}
            onScrubTo={handleOverviewScrub}
          />
        </div>
      )}
      <div className={clsx('relative z-10', compact ? 'flex items-start justify-between gap-3 text-slate-100' : 'flex items-center justify-between text-slate-100')}>
        {track ? (
          <div>
            <div className="flex items-center gap-2">
              <h3
                ref={titleGlowRef}
                id={deckTitleId}
                className={clsx('font-[800] tracking-tight neon-text-glow', compact ? 'text-sm' : 'text-[length:var(--step-1)]')}
                style={{ fontFamily: 'var(--font-heading)', color: deckTheme.primary }}
              >
                {title}
              </h3>
              <button
                type="button"
                onClick={() => ejectTrack(deckId)}
                className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-200 transition-colors"
                title="Eject track"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
              <p className={compact ? 'text-[11px] text-slate-300' : 'text-slate-300 text-[length:var(--step-0)]'}>
                {artist} • {isEditingBpm ? (
                <input
                  type="number"
                  className="oled-display font-bold text-slate-100 tabular-nums bg-transparent border-b border-studio-gold/60 outline-none w-16 text-center"
                  value={bpmInputValue}
                  autoFocus
                  onChange={(e) => setBpmInputValue(e.target.value)}
                  onBlur={() => {
                    const newBpm = parseFloat(bpmInputValue);
                    if (track && Number.isFinite(newBpm) && newBpm > 0) {
                      const originalBpm = Number(track.bpm);
                      const newPitchPercent = ((newBpm / originalBpm) - 1) * 100;
                      setPitch(deckId, newPitchPercent);
                      setCurrentBpm(newBpm);
                    }
                    setIsEditingBpm(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setIsEditingBpm(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="oled-display font-bold text-slate-100 tabular-nums cursor-pointer hover:text-studio-gold transition-colors inline-flex items-center justify-center min-w-[44px] min-h-[44px]"
                  onDoubleClick={() => {
                    if (!track) return;
                    setBpmInputValue(String(bpm));
                    setIsEditingBpm(true);
                  }}
                  title="Double-click to edit BPM"
                >{bpm}</span>
              )} BPM • <span className="oled-display font-bold text-slate-100">{keySignature}</span>
            </p>
            <button
              onClick={handleTap}
              className={compact ? 'px-1.5 py-0.5 bg-studio-black border rounded text-[8px] font-black transition-colors active:bg-white/5' : 'px-2 py-0.5 bg-studio-black border rounded text-[9px] font-black transition-colors active:bg-white/5'}
              style={{ borderColor: `rgba(${deckTheme.primaryRgb}, 0.45)`, color: deckTheme.primary }}
            >
              TAP
            </button>
          </div>
        </div>
        ) : (
          <div className="flex-1 flex items-center">
            <button
              type="button"
              onClick={handleLoadTrack}
              className={clsx(
                'mpc-pad flex items-center justify-center gap-2 !aspect-auto',
                compact ? 'w-full h-12' : 'w-full h-16'
              )}
              style={{
                borderColor: `rgba(${deckTheme.primaryRgb}, 0.4)`,
                ['--deck-primary' as string]: deckTheme.primary,
              }}
            >
              <Disc3 className={compact ? 'w-4 h-4' : 'w-5 h-5'} style={{ color: deckTheme.primary }} />
              <span
                className={clsx('oled-display font-black tracking-[0.2em] uppercase', compact ? 'text-[10px]' : 'text-xs')}
                style={{ color: deckTheme.primary }}
              >
                + Load Track
              </span>
            </button>
          </div>
        )}
        <div className="text-right">
          <p className={compact ? 'oled-display font-bold text-slate-200 tabular-nums neon-text-glow text-base' : 'oled-display font-bold text-slate-200 tabular-nums neon-text-glow text-[length:var(--step-3)]'}>{timeRemaining}</p>
          <p className={compact ? 'text-slate-500 text-[9px] uppercase tracking-[0.2em]' : 'text-slate-500 text-[10px] uppercase tracking-widest'}>Remaining</p>
        </div>
      </div>

      {/* Stem LEDs */}
      <div className={compact ? 'flex items-center gap-2' : 'flex items-center gap-3'}>
        {(['VOC', 'DRM', 'INST'] as const).map((stem) => {
          const colors: Record<string, string> = { VOC: '#FF0000', DRM: '#0096FF', INST: '#D4AF37' };
          const glows: Record<string, string> = {
            VOC: 'rgba(255,0,0,0.5)',
            DRM: 'rgba(0,150,255,0.5)',
            INST: 'rgba(212,175,55,0.5)',
          };
          const stemKeyMap: Record<string, 'vocals' | 'drums' | 'inst'> = { VOC: 'vocals', DRM: 'drums', INST: 'inst' };
          const isActive = stems[stemKeyMap[stem]];
          return (
            <button
              key={stem}
              type="button"
              className={clsx('stem-led', isActive && 'stem-led-active')}
              style={{
                ['--stem-color' as string]: colors[stem],
                ['--stem-glow' as string]: glows[stem],
              }}
              onClick={() => { toggleStem(deckId, stemKeyMap[stem]); if (navigator.vibrate) navigator.vibrate(20); }}
            >
              {stem}
            </button>
          );
        })}
        <span className="text-[8px] uppercase tracking-[0.2em] text-slate-600 ml-1">Stems</span>
      </div>

      <div className={compact ? 'grid min-h-0 flex-1 grid-cols-[minmax(132px,148px)_minmax(0,1fr)_64px] items-start gap-3 py-1' : 'grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_76px] items-start gap-4 py-2'}>
        <div className={compact ? 'flex justify-center pt-1' : 'flex min-w-0 flex-col items-center gap-4'}>
          {renderJogWheel()}
          {/* Transport */}
          <div className={compact ? 'flex flex-wrap items-center justify-center gap-2 w-full' : 'flex flex-wrap items-center justify-center gap-4 w-full'}>
             <MagneticButton
               strength={60}
               onClick={() => {
                 setIsMonitorCueEnabled((prev) => !prev);
                 if (navigator.vibrate) navigator.vibrate(20);
               }}
               className={compact ? 'shrink-0 h-9 w-14 rounded-lg bg-[#050505] border-2 text-slate-100 shadow-[0_4px_0_rgba(212,175,55,0.45)] flex flex-col items-center justify-center text-[10px] font-black tracking-tight transition-all active:translate-y-1 active:shadow-[0_2px_0_rgba(212,175,55,0.45)] touch-none' : 'shrink-0 w-20 h-12 rounded-lg bg-[#050505] border-2 text-slate-100 shadow-[0_6px_0_rgba(212,175,55,0.45)] flex flex-col items-center justify-center font-black tracking-tight transition-all active:translate-y-1 active:shadow-[0_2px_0_rgba(212,175,55,0.45)] touch-none'}
               style={{
                  borderColor: isMonitorCueEnabled ? '#00FF00' : deckTheme.primary,
                  color: isMonitorCueEnabled ? '#00FF00' : deckTheme.primary,
                  boxShadow: compact
                    ? isMonitorCueEnabled
                      ? '0 4px 0 rgba(0,255,0,0.45), 0 0 12px rgba(0,255,0,0.25)'
                      : `0 4px 0 rgba(${deckTheme.primaryRgb},0.45)`
                    : isMonitorCueEnabled
                      ? '0 6px 0 rgba(0,255,0,0.45), 0 0 12px rgba(0,255,0,0.25)'
                      : `0 6px 0 rgba(${deckTheme.primaryRgb},0.45)`,
                }}
              >
               <span className="text-xs leading-none">CUE</span>
             </MagneticButton>
             <MagneticButton
               strength={60}
               onClick={() => { toggleSync(deckId); if (navigator.vibrate) navigator.vibrate(20); }}
               disabled={!track}
               className={clsx(
                 compact
                   ? 'shrink-0 h-9 w-14 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4'
                   : 'shrink-0 w-20 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4',
                 syncButtonClass
               )}
               style={{
                 borderColor: sync ? deckTheme.primary : `rgba(${deckTheme.primaryRgb}, 0.35)`,
                 color: sync ? deckTheme.primary : '#cbd5e1',
                 boxShadow: sync ? `0 0 10px rgba(${deckTheme.primaryRgb},0.35)` : undefined,
               }}
             >
               <span className="text-xs">SYNC</span>
             </MagneticButton>
             <MagneticButton
               strength={60}
               onClick={togglePlay}
               disabled={!track}
               className={clsx(
                 compact
                   ? 'shrink-0 h-9 w-16 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4'
                   : 'shrink-0 w-24 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4',
                 playButtonClass
               )}
               style={{
                 borderColor: `rgba(${deckTheme.primaryRgb}, 0.45)`,
                 background: isPlaying ? deckTheme.primary : undefined,
                 boxShadow: isPlaying ? `0 0 12px rgba(${deckTheme.primaryRgb}, 0.45)` : undefined,
               }}
             >
               <Play className={clsx(compact ? 'h-5 w-5' : 'w-6 h-6', isPlaying ? 'fill-slate-900' : 'fill-slate-200')} />
             </MagneticButton>
             {/* Key Lock Toggle */}
             <MagneticButton
                strength={40}
                onClick={() => toggleKeyLock(deckId)}
                disabled={!track}
                className={clsx(
                  compact
                    ? 'shrink-0 h-9 w-14 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold transition-all active:border-b-0 active:translate-y-1 touch-none border-b-4 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'shrink-0 w-20 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none border-b-4 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                style={{
                  borderColor: keyLock ? deckTheme.primary : `rgba(${deckTheme.primaryRgb}, 0.3)`,
                 color: keyLock ? deckTheme.primary : '#64748b',
                 background: keyLock ? `rgba(${deckTheme.primaryRgb}, 0.12)` : undefined,
                 boxShadow: keyLock ? `0 0 10px rgba(${deckTheme.primaryRgb}, 0.3)` : undefined,
               }}
              >
                <span className="text-[9px] leading-none">{keyLock ? 'KEY' : 'VINYL'}</span>
                <span className="text-[7px] leading-none mt-0.5 opacity-60">{keyLock ? 'LOCK' : 'MODE'}</span>
              </MagneticButton>
           </div>
           {keyLock && !keyLockSupported && (
             <div
               role="alert"
               aria-live="polite"
               className="mt-2 text-[10px] uppercase tracking-[0.2em] text-studio-crimson oled-display"
             >
               Key lock not supported: pitch changes with tempo.
             </div>
           )}
         </div>

        {/* Pitch / Tempo Fader */}
        <div className={compact ? '' : 'flex justify-center lg:pt-3'}>
          <PitchFader
            pitchPercent={pitchPercent}
            temporaryPitch={temporaryPitch}
            isSynced={sync}
            compact={compact}
            onPitchChange={(nextPitchPercent) => setPitch(deckId, nextPitchPercent)}
            onDisableSync={() => toggleSync(deckId)}
            onNudgeDownStart={handleNudgeDownStart}
            onNudgeDownEnd={handleNudgeDownEnd}
            onNudgeUpStart={handleNudgeUpStart}
            onNudgeUpEnd={handleNudgeUpEnd}
          />
        </div>
      </div>

      <div className="w-full">
        <button
          type="button"
          onClick={() => setIsPerformanceOpen((prev) => !prev)}
          className={compact
            ? 'w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-left text-slate-200 backdrop-blur-lg shadow-lg hover:border-white/20 transition-colors'
            : 'w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left text-slate-200 backdrop-blur-lg shadow-lg hover:border-white/20 transition-colors'}
          style={{ borderColor: `rgba(${deckTheme.primaryRgb}, 0.24)` }}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: deckTheme.primary, boxShadow: `0 0 10px rgba(${deckTheme.primaryRgb},0.7)` }} />
            <div className={compact ? 'text-[10px] font-semibold tracking-[0.2em] uppercase' : 'text-xs font-semibold tracking-[0.2em] uppercase'}>
              Deck {deckId} Pads
            </div>
          </div>
          <span className="text-[11px] text-slate-400">{isPerformanceOpen ? 'Hide' : 'Show'}</span>
        </button>

        <AnimatePresence initial={false}>
          {isPerformanceOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden bg-studio-black/90 backdrop-blur-xl border-x border-b rounded-b-xl shadow-2xl mt-1"
              style={{ borderColor: `rgba(${deckTheme.primaryRgb}, 0.2)` }}
            >
              <div className={compact ? 'p-2.5' : 'p-3'}>
                <PerformancePads
                  deckId={deckId}
                  cuePoints={cuePoints}
                  shiftHeld={shiftHeld}
                  pressedSlots={pressedSlots}
                  compact={compact}
                  accentColor={deckTheme.primary}
                  accentRgb={deckTheme.primaryRgb}
                  padMode={padMode}
                  onPadModeChange={setPadMode}
                  onPadHold={(slot) => {
                    void handlePadHold(slot);
                  }}
                  onPadRelease={handlePadRelease}
                  onClearCue={(slot) => {
                    void clearCueSlot(slot);
                  }}
                  onAutoGenerate={() => {
                    const bpm = Number(track?.bpm) || 120;
                    void autoGenerateCues(deckId, bpm);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FXRack
        deckId={deckId}
        compact={compact}
        accentColor={deckTheme.primary}
        accentRgb={deckTheme.primaryRgb}
        secondaryColor={deckTheme.secondary}
        onFxChange={(type, val) => {
          const trackBpm = Number(track?.bpm) || 120;
          AudioEngine.getInstance().setDeckFX(deckId, type, val, trackBpm);
        }}
        onStemFxSendChange={(stem, active) => AudioEngine.getInstance().setStemFXSend(deckId, stem, active ? 1 : 0)}
      />
    </section>
  );
}
