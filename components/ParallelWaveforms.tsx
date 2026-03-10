'use client';

import { useEffect, useRef } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useUIStore } from '@/store/uiStore';

type DeckSnapshot = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  bpm: number;
  buffer: AudioBuffer | null;
};

export function ParallelWaveforms() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoom = useUIStore((state) => state.waveformZoom);
  const setZoom = useUIStore((state) => state.setWaveformZoom);

  const deckARef = useRef<DeckSnapshot>({
    currentTime: useDeckStore.getState().deckA.currentTime,
    duration: useDeckStore.getState().deckA.duration,
    isPlaying: useDeckStore.getState().deckA.isPlaying,
    bpm: Number(useDeckStore.getState().deckA.track?.bpm) || 120,
    buffer: useDeckStore.getState().deckA.buffer,
  });
  const deckBRef = useRef<DeckSnapshot>({
    currentTime: useDeckStore.getState().deckB.currentTime,
    duration: useDeckStore.getState().deckB.duration,
    isPlaying: useDeckStore.getState().deckB.isPlaying,
    bpm: Number(useDeckStore.getState().deckB.track?.bpm) || 120,
    buffer: useDeckStore.getState().deckB.buffer,
  });

  useEffect(() => {
    const unsubA = useDeckStore.subscribe(
      (state) => {
        const d = state.deckA;
        return {
          currentTime: d.currentTime,
          duration: d.duration,
          isPlaying: d.isPlaying,
          bpm: Number(d.track?.bpm) || 120,
          buffer: d.buffer,
        };
      },
      (val) => {
        deckARef.current = val;
      }
    );
    const unsubB = useDeckStore.subscribe(
      (state) => {
        const d = state.deckB;
        return {
          currentTime: d.currentTime,
          duration: d.duration,
          isPlaying: d.isPlaying,
          bpm: Number(d.track?.bpm) || 120,
          buffer: d.buffer,
        };
      },
      (val) => {
        deckBRef.current = val;
      }
    );

    return () => {
      unsubA();
      unsubB();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    let playheadA = deckARef.current.currentTime;
    let playheadB = deckBRef.current.currentTime;

    const COLOR_A = '#D4AF37';
    const COLOR_B = '#E11D48';

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const drawBeatGrid = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      yOffset: number,
      bpm: number,
      playhead: number,
      pixelsPerSecond: number
    ) => {
      const secondsPerBeat = 60 / (bpm || 120);
      const pixelsPerBeat = secondsPerBeat * pixelsPerSecond;
      const centerX = width / 2;
      const beatsToDraw = Math.ceil(width / pixelsPerBeat) + 4;
      const currentBeatIndex = Math.floor(playhead / secondsPerBeat);

      for (let i = -beatsToDraw; i <= beatsToDraw; i++) {
        const beatIndex = currentBeatIndex + i;
        const beatTime = beatIndex * secondsPerBeat;
        const x = centerX + (beatTime - playhead) * pixelsPerSecond;
        if (x < 0 || x > width) continue;

        const isDownbeat = beatIndex % 4 === 0;
        ctx.save();
        ctx.strokeStyle = isDownbeat ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = isDownbeat ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, yOffset);
        ctx.lineTo(x, yOffset + height);
        ctx.stroke();
        ctx.restore();
      }
    };

    const drawWaveform = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      yOffset: number,
      color: string,
      playheadRaw: number,
      buffer: AudioBuffer | null,
      pixelsPerSecond: number,
      isTop: boolean
    ) => {
      if (!buffer) return;
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
      const centerY = yOffset + height / 2;
      const amp = height * 0.48;
      const barWidth = 2;
      const samplesPerBar = Math.max(1, Math.floor((barWidth / pixelsPerSecond) * buffer.sampleRate));
      const centerPixel = width / 2;

      ctx.fillStyle = color;

      for (let x = 0; x < width; x += barWidth) {
        const timeAtPixel = playheadRaw + ((x - centerPixel) / pixelsPerSecond);
        if (timeAtPixel < 0 || timeAtPixel > buffer.duration) continue;

        const sampleStart = Math.floor(timeAtPixel * buffer.sampleRate);
        let max = 0;
        for (let i = 0; i < samplesPerBar; i++) {
          const idx = sampleStart + i;
          if (idx >= left.length) break;
          const sample = right ? (left[idx] + right[idx]) * 0.5 : left[idx];
        const abs = Math.abs(sample);
        if (abs > max) max = abs;
      }
      const barHeight = max * amp;
      if (isTop) {
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
      } else {
        ctx.fillRect(x, centerY, barWidth, barHeight);
      }
    }
  };

    const drawPlayhead = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const centerPixel = width / 2;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(centerPixel, 0);
      ctx.lineTo(centerPixel, height);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(centerPixel, height / 2 - 6);
      ctx.lineTo(centerPixel + 6, height / 2);
      ctx.lineTo(centerPixel, height / 2 + 6);
      ctx.lineTo(centerPixel - 6, height / 2);
      ctx.fill();

      ctx.shadowBlur = 0;
    };

    const renderLoop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const snapA = deckARef.current;
      const snapB = deckBRef.current;

      if (snapA.isPlaying) playheadA += dt;
      else playheadA = snapA.currentTime;

      if (snapB.isPlaying) playheadB += dt;
      else playheadB = snapB.currentTime;

      const width = canvas.width;
      const height = canvas.height;
      const halfHeight = height / 2;
      const pixelsPerSecond = zoom;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, width, height);

      drawBeatGrid(ctx, width, halfHeight, 0, snapA.bpm, playheadA, pixelsPerSecond);
      drawBeatGrid(ctx, width, halfHeight, halfHeight, snapB.bpm, playheadB, pixelsPerSecond);

      drawWaveform(ctx, width, halfHeight, 0, COLOR_A, playheadA, snapA.buffer, pixelsPerSecond, true);
      drawWaveform(ctx, width, halfHeight, halfHeight, COLOR_B, playheadB, snapB.buffer, pixelsPerSecond, false);

      drawPlayhead(ctx, width, height);

      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, halfHeight - 1, width, 2);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [zoom]);

  return (
    <div
      ref={containerRef}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((prev) => Math.min(Math.max(prev + e.deltaY * -0.1, 20), 300));
      }}
      className="h-24 md:h-32 xl:h-40 w-full flex-shrink-0 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl border-b-accent/20 overflow-hidden relative"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
