'use client';

import { Play } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useCallback, DragEvent, useRef, useEffect, useId, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import Spline from '@splinetool/react-spline';
import { useDeckStore } from '@/store/deckStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTrackCueStore } from '@/store/trackCueStore';
import { useDeckAudio } from '@/hooks/useDeckAudio';
import { usePerformanceKeys } from '@/hooks/usePerformanceKeys';
import { OverviewWaveform } from '@/components/OverviewWaveform';
import { PerformancePads } from '@/components/deck/PerformancePads';
import { PitchFader } from '@/components/deck/PitchFader';
import { FXRack } from '@/components/deck/FXRack';
import { AudioEngine } from '@/lib/audioEngine';
import { MagneticButton } from '@/components/ui/MagneticButton';
import type { Track } from '@/lib/db';

interface DeckProps {
  deckId: 'A' | 'B';
}

const isTrackPayload = (value: unknown): value is Track => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Track>;
  return typeof candidate.title === 'string' && typeof candidate.artist === 'string' && typeof candidate.bpm === 'string';
};

export function Deck({ deckId }: Readonly<DeckProps>) {
  const isRight = deckId === 'B';
  const loadTrack = useDeckStore((state) => state.loadTrack);
  const setPitch = useDeckStore((state) => state.setPitch);
  const toggleSync = useDeckStore((state) => state.toggleSync);
  const { pitchPercent, sync } = useDeckStore(
    (state) => {
      const deck = deckId === 'A' ? state.deckA : state.deckB;
      return { pitchPercent: deck.pitchPercent, sync: deck.sync };
    },
    useShallow
  );
  const { tracks } = useLibraryStore();
  const { currentTime, duration, isPlaying, isLoading, track, togglePlay, scrubTrack, endScrub, getAudioData } = useDeckAudio(deckId);
  const { setCue, clearCue, loadCues, getCues, autoGenerateCues } = useTrackCueStore();

  const [currentBpm, setCurrentBpm] = useState(track ? Number(track.bpm) : 120);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isNudgingUp, setIsNudgingUp] = useState(false);
  const [isNudgingDown, setIsNudgingDown] = useState(false);
  const [scratchOffset, setScratchOffset] = useState(0);

  const cuePoints = useMemo(() => (track?.id ? getCues(track.id) : []), [getCues, track]);

  useEffect(() => {
    if (track?.id) {
      loadCues(track.id);
    }
  }, [track?.id, loadCues]);

  useEffect(() => {
    AudioEngine.getInstance().createDeckFxBus(deckId);
  }, [deckId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setScratchOffset(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [track?.id]);

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
  const jogWheelRef = useRef<HTMLButtonElement>(null);
  const lastAngleRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const lastMoveTimeRef = useRef<number>(0);
  const lastDeltaRef = useRef<number>(0);
  const splineAppRef = useRef<any>(null);
  const platterNodeRef = useRef<any>(null);
  const currentTimeRef = useRef(currentTime);
  const scratchRef = useRef(scratchOffset);

  // Deck specific identity colors and styling hooks
  const deckText = isRight ? 'text-deck-b' : 'text-deck-a';
  const deckBorder = isRight ? 'border-deck-b' : 'border-deck-a';
  const deckBg = isRight ? 'bg-deck-b' : 'bg-deck-a';
  const deckStroke = isRight ? '#E11D48' : '#D4AF37';

  const containerRef = useRef<HTMLDivElement>(null);
  const jogWheelDataRingRef = useRef<SVGCircleElement>(null);
  const titleGlowRef = useRef<HTMLHeadingElement>(null);
  const deckTitleId = useId();
  const dropDescriptionId = useId();

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
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

  // Audio Reactive Visuals
  useEffect(() => {
    let animationFrame: number;

    const animate = () => {
      const audioData = getAudioData?.();

      if (audioData) {
         const { rms, low } = audioData;

         if (containerRef.current) {
            const shadowSpread = 15 + low * 40;
            const shadowOpacity = 0.2 + low * 0.5;
            containerRef.current.style.boxShadow = `0 0 ${shadowSpread}px rgba(212,175,55, ${shadowOpacity})`;
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
  }, [getAudioData]);

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

    setScratchOffset(prev => prev + deltaAngle);
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
      setScratchOffset((prev) => prev + delta);
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
    if (!platterNodeRef.current) return;
    const radians = ((currentTime / 1.8) * 360 + scratchOffset) * (Math.PI / 180);
    platterNodeRef.current.rotation.y = radians;
  }, [currentTime, scratchOffset]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
    scratchRef.current = scratchOffset;
  }, [currentTime, scratchOffset]);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const node = platterNodeRef.current;
      if (node) {
        const baseRadians = -((currentTimeRef.current + scratchRef.current) / 1.8) * (Math.PI * 2);
        const jitter = !isPlaying ? Math.sin(performance.now() * 0.1) * 0.002 : 0;
        node.rotation.y = baseRadians + jitter;
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
    ? 'bg-studio-black border-studio-gold text-studio-gold shadow-[0_0_10px_#D4AF37]'
    : `bg-studio-slate border-studio-gold/30 text-slate-300 hover:${deckBorder} hover:${deckText}`;
  const playButtonClass = isPlaying
    ? `${deckBg} text-slate-900 shadow-[0_0_12px_rgba(212,175,55,0.45)] ${deckBorder}`
    : `bg-studio-slate border-studio-gold/30 text-slate-300 hover:${deckBorder} hover:${deckText}`;

  const handleSplineLoad = (spline: any) => {
    splineAppRef.current = spline;
    platterNodeRef.current =
      spline?.findObjectByName?.('Platter') ??
      spline?.findObjectByName?.('Disk') ??
      spline?.children?.[0] ??
      null;
    if (platterNodeRef.current) {
      const radians = ((currentTime / 1.8) * 360 + scratchOffset) * (Math.PI / 180);
      platterNodeRef.current.rotation.y = radians;
    }
  };

  const renderJogWheel = () => (
    <div className="jogwheel-wrapper flex flex-col gap-4 items-center">
      <div className="relative w-64 h-64">
        <Spline
          scene="https://prod.spline.design/NuXDSBxPTsCkXbkq/scene.splinecode"
          onLoad={handleSplineLoad}
          className="absolute inset-0"
        />
        <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 256 256">
          <circle cx="128" cy="128" r="120" fill="transparent" stroke={isRight ? 'rgba(225, 29, 72, 0.25)' : 'rgba(212, 175, 55, 0.25)'} strokeWidth="3" />
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
          className="absolute inset-0 rounded-full border-4 border-studio-gold/40 shadow-[0_0_35px_rgba(212,175,55,0.35)] overflow-hidden cursor-pointer touch-none"
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
                <div className={clsx('w-12 h-12 border-2 border-t-transparent rounded-full animate-spin', deckBorder)}></div>
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
        "deck-container bg-studio-slate/90 backdrop-blur-xl rounded-xl border border-studio-gold/20 p-6 flex flex-col gap-4 transition-colors duration-300 touch-none select-none shadow-2xl transform",
        isDragOver
          ? "scale-[1.02] ring-2 ring-offset-0 ring-studio-gold border-transparent"
          : ""
      )}
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
      <OverviewWaveform
        deckId={deckId}
        duration={duration}
        currentTime={currentTime}
        track={track}
        accentColor={deckStroke}
        onScrubTo={handleOverviewScrub}
      />
      <div className="flex items-center justify-between text-slate-100">
        <div>
           <h3
             ref={titleGlowRef}
             id={deckTitleId}
             className={clsx("font-[800] tracking-tight neon-text-glow text-[length:var(--step-1)]", deckText)}
             style={{ fontFamily: 'var(--font-heading)' }}
           >
             {title}
          </h3>
          <div className="flex items-center gap-2">
            <p className="text-slate-300 text-[length:var(--step-0)]">
              {artist} • <span className="font-mono font-bold text-slate-100 tabular-nums">{bpm}</span> BPM • <span className="font-mono font-bold text-slate-100">{keySignature}</span>
            </p>
            <button
              onClick={handleTap}
              className="px-2 py-0.5 bg-studio-black border border-studio-gold/40 rounded text-[9px] font-black transition-colors active:bg-white/5 text-studio-gold"
            >
              TAP
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-slate-200 tabular-nums neon-text-glow text-[length:var(--step-3)]">{timeRemaining}</p>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest">Remaining</p>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row items-center gap-6 py-4">
        <div className="flex-1 flex justify-center">
          {renderJogWheel()}
        </div>

        {/* Transport & Performance Pads */}
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm">
          {/* Transport */}
          <div className="flex flex-wrap items-center justify-center gap-4 w-full min-w-[300px]">
             <MagneticButton
               strength={60}
               className="shrink-0 w-20 h-12 rounded-lg bg-[#050505] border-2 border-studio-gold text-studio-gold shadow-[0_6px_0_rgba(212,175,55,0.45)] flex flex-col items-center justify-center font-black tracking-tight transition-all active:translate-y-1 active:shadow-[0_2px_0_rgba(212,175,55,0.45)] touch-none"
             >
               <span className="text-xs leading-none">CUE</span>
             </MagneticButton>
             <MagneticButton
               strength={60}
               onClick={() => toggleSync(deckId)}
               disabled={!track}
               className={clsx(
                 'shrink-0 w-20 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4',
                 syncButtonClass
               )}
             >
               <span className="text-xs">SYNC</span>
             </MagneticButton>
             <MagneticButton
               strength={60}
               onClick={togglePlay}
               disabled={!track}
               className={clsx(
                 'shrink-0 w-24 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4',
                 playButtonClass
               )}
             >
               <Play className={clsx('w-6 h-6', isPlaying ? 'fill-slate-900' : 'fill-slate-200')} />
             </MagneticButton>
          </div>

          {/* Performance Pads 2x4 Grid */}
          <PerformancePads
            deckId={deckId}
            cuePoints={cuePoints}
            shiftHeld={shiftHeld}
            pressedSlots={pressedSlots}
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

        {/* Pitch / Tempo Fader */}
        <PitchFader
          pitchPercent={pitchPercent}
          temporaryPitch={temporaryPitch}
          isSynced={sync}
          onPitchChange={(nextPitchPercent) => setPitch(deckId, nextPitchPercent)}
          onDisableSync={() => toggleSync(deckId)}
          onNudgeDownStart={handleNudgeDownStart}
          onNudgeDownEnd={handleNudgeDownEnd}
          onNudgeUpStart={handleNudgeUpStart}
          onNudgeUpEnd={handleNudgeUpEnd}
        />
      </div>

      <FXRack
        deckId={deckId}
        onFxChange={(type, val) => AudioEngine.getInstance().setDeckFX(deckId, type, val)}
      />
    </section>
  );
}
