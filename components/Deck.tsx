'use client';

import { Play } from 'lucide-react';
import { clsx } from 'clsx';
import { Component, useState, useCallback, DragEvent, useRef, useEffect, useId, useMemo, type ReactNode } from 'react';
import Spline from '@splinetool/react-spline';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeckStore } from '@/store/deckStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTrackCueStore } from '@/store/trackCueStore';
import { useDeckAudio } from '@/hooks/useDeckAudio';
import { usePerformanceKeys } from '@/hooks/usePerformanceKeys';
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

const SPLINE_SCENE_URL = 'https://prod.spline.design/NuXDSBxPTsCkXbkq/scene.splinecode';
const SPLINE_LOAD_TIMEOUT_MS = 4000;

class SplineErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

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
  const setPitch = useDeckStore((state) => state.setPitch);
  const toggleSync = useDeckStore((state) => state.toggleSync);
  const pitchPercent = useDeckStore((state) => (deckId === 'A' ? state.deckA.pitchPercent : state.deckB.pitchPercent));
  const sync = useDeckStore((state) => (deckId === 'A' ? state.deckA.sync : state.deckB.sync));
  const stems = useDeckStore((state) => (deckId === 'A' ? state.deckA.stems : state.deckB.stems));
  const toggleStem = useDeckStore((state) => state.toggleStem);
  const { tracks } = useLibraryStore();
  const { currentTime, duration, isPlaying, isLoading, track, togglePlay, scrubTrack, endScrub, getAudioData } = useDeckAudio(deckId);
  const { volumeScale } = useAudioAnalyzer(deckId);
  const { setCue, clearCue, loadCues, getCues, autoGenerateCues } = useTrackCueStore();

  const [currentBpm, setCurrentBpm] = useState(track ? Number(track.bpm) : 120);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isNudgingUp, setIsNudgingUp] = useState(false);
  const [isNudgingDown, setIsNudgingDown] = useState(false);
  const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
  const splineEnabled = !compact && process.env.NEXT_PUBLIC_ENABLE_SPLINE === 'true';
  const [splineStatus, setSplineStatus] = useState<'loading' | 'ready' | 'fallback'>(splineEnabled ? 'loading' : 'fallback');
  const [deckTheme, setDeckTheme] = useState<DeckTheme>(DEFAULT_DECK_THEME[deckId]);

  const cuePoints = useMemo(() => (track?.id ? getCues(track.id) : []), [getCues, track]);

  useEffect(() => {
    if (track?.id) {
      loadCues(track.id);
    }
  }, [track?.id, loadCues]);

  useEffect(() => {
    void AudioEngine.getInstance().createDeckFxBus(deckId);
  }, [deckId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scratchOffsetRef.current = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [track?.id]);

  useEffect(() => {
    if (!splineEnabled || splineStatus !== 'loading') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSplineStatus((current) => (current === 'loading' ? 'fallback' : current));
    }, SPLINE_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [splineEnabled, splineStatus]);

  useEffect(() => {
    if (!splineEnabled) {
      platterNodeRef.current = null;
      setSplineStatus('fallback');
      return;
    }

    setSplineStatus('loading');
  }, [splineEnabled]);

  const startStutterFromSlot = useCallback(async (slot: number) => {
    if (!track?.id) return;
    const existing = cuePoints.find((c) => c.slot === slot);
    const cueTime = existing ? existing.time : currentTime;

    if (!existing) {
      await setCue(track.id, slot, cueTime, 'hot');
    }

    AudioEngine.getInstance().startStutter(deckId, cueTime);
  }, [track, cuePoints, currentTime, deckId, setCue]);

  const stopStutterFromSlot = useCallback((slot: number) => {
    if (!track?.id) return;
    const existing = cuePoints.find((c) => c.slot === slot);
    const cueTime = existing ? existing.time : currentTime;
    AudioEngine.getInstance().stopStutter(deckId, cueTime);
  }, [track, cuePoints, currentTime, deckId]);

  const clearCueSlot = useCallback(async (slot: number) => {
    if (!track?.id) return;
    await clearCue(track.id, slot);
  }, [track, clearCue]);

  const { shiftHeld, pressedSlots } = usePerformanceKeys({
    deckId,
    getCueTime: (slot) => {
      const existing = cuePoints.find((c) => c.slot === slot);
      return existing ? existing.time : null;
    },
    startStutter: (time) => AudioEngine.getInstance().startStutter(deckId, time),
    stopStutter: (time) => AudioEngine.getInstance().stopStutter(deckId, time),
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
  const platterNodeRef = useRef<any>(null);
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

    // Time delta: 33.333 RPM = 1.8 seconds per revolution.
    // So deltaTime = deltaAngle / 360 * 1.8
    const timeDelta = (deltaAngle / 360) * 1.8;
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
  const artist = track?.artist || 'Drag track here';
  const bpm = track ? currentBpm : '--';
  const keySignature = track?.key || '--';
  const timeRemaining = track ? formatTime(duration - currentTime) : '00:00.00';

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
      const combinedTime = currentTimeRef.current + scratchOffsetRef.current;
      const baseRadians = -((combinedTime) / 1.8) * (Math.PI * 2);
      const jitter = !isPlaying ? Math.sin(performance.now() * 0.1) * 0.002 : 0;
      const node = platterNodeRef.current;
      if (node) {
        node.rotation.y = baseRadians + jitter;
      }
      const fallback = fallbackPlatterRef.current;
      if (fallback) {
        fallback.style.transform = `rotate(${((-baseRadians - jitter) * 180) / Math.PI}deg)`;
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

  const handleSplineLoad = (spline: any) => {
    const nextPlatterNode =
      spline?.findObjectByName?.('Platter') ??
      spline?.findObjectByName?.('Disk') ??
      spline?.children?.[0] ??
      null;
    // eslint-disable-next-line react-hooks/immutability -- imperative Spline runtime object
    platterNodeRef.current = nextPlatterNode;
    setSplineStatus('ready');
    if (nextPlatterNode) {
      const radians = ((currentTime / 1.8) * 360 + scratchOffsetRef.current) * (Math.PI / 180);
      nextPlatterNode.rotation.y = radians;
    }
  };

  const handleSplineFailure = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- imperative Spline runtime object
    platterNodeRef.current = null;
    setSplineStatus('fallback');
  }, []);

  const renderJogWheel = () => (
    <div className="jogwheel-wrapper flex flex-col gap-4 items-center deck-chassis rounded-2xl p-4">
      <div className={compact ? 'relative h-36 w-36 sm:h-40 sm:w-40' : 'relative w-64 h-64'}>
        {splineStatus !== 'ready' && (
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
        )}
        {splineEnabled && splineStatus !== 'fallback' && (
          <SplineErrorBoundary onError={handleSplineFailure}>
            <Spline
              scene={SPLINE_SCENE_URL}
              onLoad={handleSplineLoad}
              className={clsx('absolute inset-0 transition-opacity duration-300', splineStatus === 'ready' ? 'opacity-100' : 'opacity-0')}
            />
          </SplineErrorBoundary>
        )}
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
            {!isLoading && splineStatus === 'fallback' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.24em] text-slate-300">
                Local Visual
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
        'deck-container deck-chassis rounded-xl border flex flex-col transition-colors duration-300 touch-none select-none shadow-2xl transform',
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
      <p id={dropDescriptionId} className="sr-only">
        Drag and drop a track onto this deck to load it.
      </p>
      {!compact && (
        <div className="relative" style={{ opacity: WAVEFORM_BASE_OPACITY + volumeScale * WAVEFORM_OPACITY_RANGE }}>
          <OverviewWaveform
            deckId={deckId}
            duration={duration}
            currentTime={currentTime}
            track={track}
            accentColor={deckStroke}
            compact={compact}
            onScrubTo={handleOverviewScrub}
          />
          <div className="crt-scanline-overlay rounded" />
        </div>
      )}
      <div className={compact ? 'flex items-start justify-between gap-3 text-slate-100' : 'flex items-center justify-between text-slate-100'}>
        <div>
           <h3
             ref={titleGlowRef}
             id={deckTitleId}
             className={clsx('font-[800] tracking-tight neon-text-glow', compact ? 'text-sm' : 'text-[length:var(--step-1)]')}
             style={{ fontFamily: 'var(--font-heading)', color: deckTheme.primary }}
           >
             {title}
          </h3>
          <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2'}>
            <p className={compact ? 'text-[11px] text-slate-300' : 'text-slate-300 text-[length:var(--step-0)]'}>
              {artist} • <span className="oled-display font-bold text-slate-100 tabular-nums">{bpm}</span> BPM • <span className="oled-display font-bold text-slate-100">{keySignature}</span>
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
        <div className="text-right">
          <p className={compact ? 'oled-display font-bold text-slate-200 tabular-nums neon-text-glow text-base' : 'oled-display font-bold text-slate-200 tabular-nums neon-text-glow text-[length:var(--step-3)]'}>{timeRemaining}</p>
          <p className={compact ? 'text-slate-500 text-[9px] uppercase tracking-[0.2em]' : 'text-slate-500 text-[10px] uppercase tracking-widest'}>Remaining</p>
        </div>
      </div>

      {/* Stem LEDs */}
      <div className={compact ? 'flex items-center gap-2' : 'flex items-center gap-3'}>
        {(['VOC', 'DRM', 'INST'] as const).map((stem) => {
          const colors: Record<string, string> = { VOC: '#00BFFF', DRM: '#FF003C', INST: '#FFD700' };
          const stemKeyMap: Record<string, 'vocals' | 'drums' | 'inst'> = { VOC: 'vocals', DRM: 'drums', INST: 'inst' };
          const isActive = stems[stemKeyMap[stem]];
          return (
            <button
              key={stem}
              type="button"
              className={clsx('stem-led', isActive && 'stem-led-active')}
              style={{ ['--stem-color' as string]: colors[stem] }}
              onClick={() => toggleStem(deckId, stemKeyMap[stem])}
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
               className={compact ? 'shrink-0 h-9 w-14 rounded-lg bg-[#050505] border-2 text-slate-100 shadow-[0_4px_0_rgba(212,175,55,0.45)] flex flex-col items-center justify-center text-[10px] font-black tracking-tight transition-all active:translate-y-1 active:shadow-[0_2px_0_rgba(212,175,55,0.45)] touch-none' : 'shrink-0 w-20 h-12 rounded-lg bg-[#050505] border-2 text-slate-100 shadow-[0_6px_0_rgba(212,175,55,0.45)] flex flex-col items-center justify-center font-black tracking-tight transition-all active:translate-y-1 active:shadow-[0_2px_0_rgba(212,175,55,0.45)] touch-none'}
               style={{
                 borderColor: deckTheme.primary,
                 color: deckTheme.primary,
                 boxShadow: compact
                   ? `0 4px 0 rgba(${deckTheme.primaryRgb},0.45)`
                   : `0 6px 0 rgba(${deckTheme.primaryRgb},0.45)`,
               }}
             >
               <span className="text-xs leading-none">CUE</span>
             </MagneticButton>
             <MagneticButton
               strength={60}
               onClick={() => toggleSync(deckId)}
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
          </div>
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
                  onPadHold={(slot) => {
                    void startStutterFromSlot(slot);
                  }}
                  onPadRelease={stopStutterFromSlot}
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
        onFxChange={(type, val) => AudioEngine.getInstance().setDeckFX(deckId, type, val)}
      />
    </section>
  );
}
