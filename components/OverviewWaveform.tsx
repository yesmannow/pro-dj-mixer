'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { useTrackCueStore } from '@/store/trackCueStore';

interface OverviewWaveformProps {
  deckId: 'A' | 'B';
  duration: number;
  currentTime: number;
  track: { id?: number; overviewWaveform?: number[] } | null;
  accentColor: string;
  compact?: boolean;
  onScrubTo?: (time: number) => void;
}

export function OverviewWaveform({
  deckId,
  duration,
  currentTime,
  track,
  accentColor: _accentColor,
  compact = false,
  onScrubTo,
}: OverviewWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const isScrubbingRef = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const peaks = useMemo(() => track?.overviewWaveform ?? [], [track?.overviewWaveform]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handleResize = () => {
      const element = containerRef.current;
      if (!element || !element.isConnected) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      setSize({ width: bounds.width, height: bounds.height });
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(node);

    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!baseCanvasRef.current || !size.width || !size.height || !peaks.length) return;

    const canvas = baseCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size.width, size.height);

    const midY = size.height / 2;
    const amp = size.height * 0.45;
    const barWidth = Math.max(1, size.width / peaks.length);

    // Amplitude-based colour mapping (Serato/Traktor style):
    // quiet → cool blues/cyans, mid → greens/yellows, loud → oranges/reds
    const getAmplitudeColor = (a: number): string => {
      if (a < 0.15) return `rgba(30, 100, 220, ${0.4 + a * 3})`;
      if (a < 0.30) {
        const t = (a - 0.15) / 0.15;
        return `rgba(${30 + t * 20}, ${100 + t * 160}, ${220 + t * 35}, 0.85)`;
      }
      if (a < 0.50) {
        const t = (a - 0.30) / 0.20;
        return `rgba(${50 + t * 150}, ${260 - t * 30 | 0}, ${255 - t * 200}, 0.9)`;
      }
      if (a < 0.70) {
        const t = (a - 0.50) / 0.20;
        return `rgba(${200 + t * 55}, ${230 - t * 80}, ${55 - t * 55}, 0.92)`;
      }
      const t = Math.min(1, (a - 0.70) / 0.30);
      return `rgba(255, ${150 - t * 150}, ${0 + t * 20}, ${0.92 + t * 0.08})`;
    };

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const val = Math.max(-1, Math.min(1, peaks[i] ?? 0));
      const absVal = Math.abs(val);
      const barHeight = absVal * amp;

      ctx.fillStyle = getAmplitudeColor(absVal);
      // Mirror bars above and below the centre line
      ctx.fillRect(x, midY - barHeight, barWidth, barHeight);
      ctx.fillRect(x, midY, barWidth, barHeight * 0.6);
    }
  }, [peaks, size.width, size.height]);

  // Render cue markers on top of the waveform
  useEffect(() => {
    if (!overlayCanvasRef.current || !size.width || !size.height || !duration || duration <= 0 || !track?.id) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The markers should be drawn on the overlay or a new dedicated canvas.
    // For now, let's use the overlay canvas but clear it carefully or draw alongside playhead.
    // Actually, it's better to redraw both playhead and markers together to avoid clearing markers.

    ctx.clearRect(0, 0, size.width, size.height);

    // 1. Draw Playhead Progress
    const ratio = Math.max(0, Math.min(1, currentTime / duration));
    const playheadWidth = size.width * ratio;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, playheadWidth, size.height);

    // 2. Draw Cue Markers
    const cues = useTrackCueStore.getState().getCues(track);
    cues.forEach(cue => {
      const cueRatio = cue.time / duration;
      const x = cueRatio * size.width;

      // Vertical line
      ctx.beginPath();
      ctx.strokeStyle = cue.color || '#ffffff';
      ctx.lineWidth = 2;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
      ctx.stroke();

      // Triangle handle at top
      ctx.fillStyle = cue.color || '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 4, 0);
      ctx.lineTo(x + 4, 0);
      ctx.lineTo(x, 6);
      ctx.fill();

      // Slot number label
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cue.slot.toString(), x, 15);
    });
  }, [currentTime, duration, size.width, size.height, track]);

  const handlePointer = useCallback(
    (clientX: number) => {
      const element = containerRef.current;
      if (!element || !element.isConnected || !duration || duration <= 0 || !onScrubTo) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width) return;
      const clampedX = Math.max(rect.left, Math.min(clientX, rect.right));
      const ratio = (clampedX - rect.left) / rect.width;
      const targetTime = ratio * duration;
      onScrubTo(targetTime);
    },
    [duration, onScrubTo]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    handlePointer(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isScrubbingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={containerRef}
      className={compact
        ? 'relative w-full h-10 bg-black/40 rounded-lg overflow-hidden border border-slate-800/50 touch-none'
        : 'relative w-full h-16 md:h-20 bg-black/40 rounded-lg overflow-hidden border border-slate-800/50 touch-none'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={baseCanvasRef} className="absolute inset-0" />
      <canvas ref={overlayCanvasRef} className="absolute inset-0" />
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/20 pointer-events-none" />
    </div>
  );
}
