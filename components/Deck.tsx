'use client';

import { Play } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useCallback, DragEvent, useRef, useEffect } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useDeckAudio } from '@/hooks/useDeckAudio';
import { OverviewWaveform } from '@/components/OverviewWaveform';

interface DeckProps {
  deckId: 'A' | 'B';
}

export function Deck({ deckId }: DeckProps) {
  const isRight = deckId === 'B';
  const { loadTrack } = useDeckStore();
  const { tracks } = useLibraryStore();
  const { currentTime, duration, isPlaying, isLoading, track, togglePlay, scrubTrack, endScrub, getAudioData } = useDeckAudio(deckId);

  const [currentBpm, setCurrentBpm] = useState(track ? Number(track.bpm) : 120);
  const [pitchPercent, setPitchPercent] = useState(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const [rotation, setRotation] = useState(0);
  const jogWheelRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  // Deck specific identity colors and styling hooks
  const deckColorName = isRight ? 'deck-b' : 'deck-a';
  const deckText = isRight ? 'text-deck-b' : 'text-deck-a';
  const deckBorder = isRight ? 'border-deck-b' : 'border-deck-a';
  const deckBg = isRight ? 'bg-deck-b' : 'bg-deck-a';
  const deckStroke = isRight ? '#f000ff' : '#00f2ff';

  const containerRef = useRef<HTMLDivElement>(null);
  const jogWheelDataRingRef = useRef<SVGCircleElement>(null);
  const titleGlowRef = useRef<HTMLHeadingElement>(null);

  // Auto-rotation when playing & Audio Reactive Visuals
  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = time - lastTime;

      if (isPlaying && !isDraggingRef.current) {
        // 33 1/3 RPM = 33.333 / 60 * 360 = 200 degrees per second
        setRotation(prev => (prev + (200 * dt) / 1000) % 360);
      }

      const audioData = getAudioData?.();

      if (audioData) {
         const { rms, low } = audioData;

         if (containerRef.current) {
            // Pulse the box-shadow on bass hits
            const shadowSpread = 15 + low * 40;
            const shadowOpacity = 0.2 + low * 0.5;
            containerRef.current.style.boxShadow = `0 0 ${shadowSpread}px rgba(${isRight ? '240,0,255' : '0,242,255'}, ${shadowOpacity})`;
         }

         if (titleGlowRef.current) {
            titleGlowRef.current.style.textShadow = `0 0 ${5 + rms * 20}px currentColor`;
            titleGlowRef.current.style.opacity = (0.7 + rms * 0.3).toString();
         }

         if (jogWheelDataRingRef.current) {
            const dashArray = 2 * Math.PI * 80;
            const fillAmount = Math.min(1, rms * 2.5);
            jogWheelDataRingRef.current.style.strokeDasharray = `${dashArray * fillAmount} ${dashArray}`;
            jogWheelDataRingRef.current.style.opacity = (0.3 + rms).toString();
         }
      }

      lastTime = time;
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, getAudioData, isRight]);

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
    // @ts-ignore
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const currentAngle = getAngle(e);
    let deltaAngle = currentAngle - lastAngleRef.current;

    // Handle wrap-around
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    setRotation(prev => (prev + deltaAngle) % 360);
    lastAngleRef.current = currentAngle;

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
    // @ts-ignore
    e.target.releasePointerCapture(e.pointerId);
    endScrub();
  };

  const handleTap = useCallback(() => {
    const now = Date.now();
    setTapTimes((prev) => {
      const newTapTimes = [...prev, now].filter((t) => now - t < 3000);

      if (newTapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < newTapTimes.length; i++) {
          intervals.push(newTapTimes[i] - newTapTimes[i - 1]);
        }
        const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const calculatedBpm = Math.round(60000 / averageInterval);
        setCurrentBpm(calculatedBpm);
      }

      return newTapTimes;
    });
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
        const droppedTrack = JSON.parse(json);
        if (droppedTrack) {
          loadTrack(deckId, droppedTrack);
          setCurrentBpm(Number(droppedTrack.bpm) || currentBpm);
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
    if (isNaN(seconds) || seconds < 0) return '00:00.00';
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

  const renderJogWheel = () => (
    <div className="flex flex-col gap-4 items-center">
      <div
        ref={jogWheelRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="jog-wheel w-48 h-48 rounded-full border-4 border-slate-800 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform touch-none"
      >
        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
          <circle cx="96" cy="96" r="90" fill="transparent" stroke={isRight ? "rgba(240, 0, 255, 0.1)" : "rgba(0, 242, 255, 0.1)"} strokeWidth="2" />
          <circle cx="96" cy="96" r="90" fill="transparent" stroke={deckStroke} strokeWidth="2" strokeDasharray={2 * Math.PI * 90} strokeDashoffset={2 * Math.PI * 90 * (1 - (duration > 0 ? currentTime / duration : 0))} className="transition-all duration-75 ease-linear" />

          {/* Cue Markers */}
          {[0.1, 0.25, 0.4, 0.6].map((pos, i) => {
            const angle = pos * Math.PI * 2;
            const x = (96 + 90 * Math.cos(angle)).toFixed(6);
            const y = (96 + 90 * Math.sin(angle)).toFixed(6);
            return (
              <circle key={i} cx={x} cy={y} r="3" fill={["#ef4444", "#22c55e", "#3b82f6", "#eab308"][i]} />
            );
          })}

          {/* Dynamic VU Data Ring */}
          <circle ref={jogWheelDataRingRef} cx="96" cy="96" r="80" fill="transparent" stroke={deckStroke} strokeWidth="4" strokeDasharray="0 1000" className="opacity-30 blur-[1px] transition-opacity" />
        </svg>
        <div className={clsx("absolute inset-0 rounded-full border", `${deckBg}/10`)} style={{ transform: `rotate(${rotation}deg)` }}>
          <div className={clsx("absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full", deckBg, isRight ? "shadow-[0_0_5px_#f000ff]" : "shadow-[0_0_5px_#00f2ff]")}></div>
        </div>
        <div className="absolute inset-7 rounded-full overflow-hidden border border-slate-700 z-[5]">
          {track?.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full bg-slate-800" style={{ backgroundImage: 'repeating-radial-gradient(#1e293b 0, #1e293b 2px, #0f172a 3px, #0f172a 4px)' }} />
          )}
          <div className="absolute inset-0 bg-black/25" />
        </div>

        <div className="w-12 h-12 bg-primary rounded-full border border-slate-700 flex items-center justify-center z-10">
          {isLoading ? (
            <div className={clsx("w-10 h-10 border-2 border-t-transparent rounded-full animate-spin", deckBorder)}></div>
          ) : (
            <div className="w-10 h-10 border-2 border-slate-600 rounded-full"></div>
          )}
          {isLoading && (
            <div className={clsx("absolute -bottom-10 text-[10px] animate-pulse font-bold tracking-widest uppercase", deckText)}>
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={clsx(
        "bg-slate-900/40 backdrop-blur-xl rounded-xl border p-6 flex flex-col gap-4 transition-colors duration-300 touch-none select-none shadow-2xl transform",
        isDragOver
          ? "scale-[1.02] ring-2 ring-offset-0 ring-[var(--deck-accent, #00f2ff)] border-transparent"
          : "border-white/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <OverviewWaveform
        deckId={deckId}
        duration={duration}
        currentTime={currentTime}
        track={track}
        accentColor={deckStroke}
        onScrubTo={handleOverviewScrub}
      />
      <div className="flex items-center justify-between">
        <div>
          <h3 ref={titleGlowRef} className={clsx("font-[800] tracking-tight neon-text-glow text-[length:var(--step-1)]", deckText)}>{title}</h3>
          <div className="flex items-center gap-2">
            <p className="text-slate-500 text-[length:var(--step-0)]">
              {artist} • <span className="font-mono font-bold text-slate-300 tabular-nums">{bpm}</span> BPM • <span className="font-mono font-bold text-slate-300">{keySignature}</span>
            </p>
            <button
              onClick={handleTap}
              className={clsx("px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9px] font-bold transition-colors active:bg-white/10 text-slate-400", `hover:${deckText}`, `hover:${deckBorder}`)}
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

      <div className="flex flex-col lg:flex-row justify-between items-center gap-6 py-4">
        {!isRight && renderJogWheel()}

        {/* Transport & Performance Pads */}
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm">
          {/* Transport */}
          <div className="flex justify-center gap-4">
             <button className={clsx("w-20 h-12 rounded-lg bg-slate-800 border-b-4 shadow-inner flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none", deckBorder, deckText)}>
               <span className="text-xs">CUE</span>
             </button>
             <button
               onClick={togglePlay}
               disabled={!track}
               className={clsx(
                 'w-24 h-12 rounded-lg flex flex-col items-center justify-center font-bold transition-all active:border-b-0 active:translate-y-1 touch-none disabled:opacity-50 disabled:cursor-not-allowed shadow-inner border-b-4',
                 isPlaying
                   ? `${deckBg} text-primary neon-glow ${deckBorder}`
                   : `bg-slate-800 border-slate-700 text-slate-400 hover:${deckBorder} hover:${deckText}`
               )}
             >
               <Play className={clsx('w-6 h-6', isPlaying ? 'fill-primary' : 'fill-slate-400')} />
             </button>
          </div>

          {/* Performance Pads 2x4 Grid */}
          <div className="grid grid-cols-4 gap-2">
            {['HOT CUE 1', 'HOT CUE 2', 'HOT CUE 3', 'HOT CUE 4', 'VOCAL', 'MELODY', 'BASS', 'DRUMPS'].map((label, i) => (
              <button
                key={i}
                className={clsx(
                  "h-12 rounded-md bg-slate-800 border-b-4 border-slate-900 shadow-inner flex flex-col items-center justify-center cursor-pointer active:border-b-0 active:translate-y-1 transition-all touch-none select-none",
                  isRight ? "hover:bg-deck-b/20 border-b-deck-b/20" : "hover:bg-deck-a/20 border-b-deck-a/20"
                )}
                onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5); }}
              >
                 <span className={clsx("text-[8px] font-bold", deckText)}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pitch / Tempo Fader */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
            Pitch
          </div>
          <div className="relative h-32 w-8 fader-track rounded-full border border-slate-800 bg-slate-950/40 flex items-center justify-center">
            <div className="absolute inset-x-2 h-0.5 bg-slate-600" />
            <div
              className={clsx(
                'absolute -left-1 w-2 h-2 rounded-full transition-all',
                Math.abs(pitchPercent) < 0.001
                  ? 'bg-lime-400 shadow-[0_0_8px_#22c55e]'
                  : 'bg-slate-700'
              )}
            />
            <input
              type="range"
              min={-8}
              max={8}
              step={0.1}
              value={pitchPercent}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                const snapped = raw > -0.8 && raw < 0.8 ? 0 : raw;
                setPitchPercent(snapped);
              }}
              className="appearance-none w-full h-24 rotate-[-90deg] outline-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_6px_#00f2ff]"
            />
          </div>
          <div className="font-mono text-[10px] text-slate-300">
            {pitchPercent.toFixed(2)}%
          </div>
        </div>

        {isRight && renderJogWheel()}
      </div>
    </div>
  );
}
