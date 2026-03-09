'use client';

import { useEffect, useRef } from 'react';
import { useDeckStore } from '@/store/deckStore';

export function ParallelWaveforms() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Subscribe to deck states but avoid fast-updating state hooks for time
  const deckA = useDeckStore((state) => state.deckA);
  const deckB = useDeckStore((state) => state.deckB);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    // Virtual Playhead States used ONLY in the canvas loop 
    // to decouple 60FPS updates from React Component re-renders.
    let playheadA = 0; // seconds
    let playheadB = 0; // seconds

    // Hardcode colors matching globals.css (Urban Luxury palette)
    const COLOR_A = '#D4AF37'; // Studio Gold
    const COLOR_B = '#E11D48'; // Studio Crimson

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, yOffset: number, color: string) => {
       ctx.strokeStyle = color + '20'; // 20 hex opacity
       ctx.lineWidth = 1;
       ctx.beginPath();
       // Horizontal grid line
       ctx.moveTo(0, yOffset + height / 2);
       ctx.lineTo(width, yOffset + height / 2);
       ctx.stroke();
    };

    const drawWaveform = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      yOffset: number, 
      color: string, 
      playheadRaw: number, 
      duration: number,
      isTop: boolean
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const centerY = yOffset + (isTop ? height : 0);
      const amp = height * 0.8;
      
      // The speed at which the waveform scrolls past the center playhead
      // We want to map 1 second of audio to roughly 100 pixels
      const pixelsPerSecond = 100;
      
      const centerPixel = width / 2;
      
      for (let x = 0; x < width; x++) {
        // Map screen pixel X to a time value
        const timeAtPixel = playheadRaw + ((x - centerPixel) / pixelsPerSecond);
        
        // Don't draw if time is less than 0 or greater than song duration
        if (timeAtPixel < 0 || (duration > 0 && timeAtPixel > duration)) {
           continue;
        }

        // Generate deterministic pseudo-noise based on time
        // High frequency sine mixed with low frequency sine
        const noiseScale = timeAtPixel * 15;
        const val1 = Math.sin(noiseScale) * 0.5;
        const val2 = Math.sin(noiseScale * 0.3) * 0.5;
        const combined = (val1 + val2) * amp * (Math.sin(timeAtPixel * 2) > 0 ? 0.3 : 1);
        
        const y = centerY + (isTop ? -Math.abs(combined) : Math.abs(combined));

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.stroke();
    };

    const drawPlayhead = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
       const centerPixel = width / 2;
       
       // Playhead glow
       ctx.shadowColor = '#ffffff';
       ctx.shadowBlur = 10;
       ctx.strokeStyle = '#ffffff';
       ctx.lineWidth = 2;
       
       ctx.beginPath();
       ctx.moveTo(centerPixel, 0);
       ctx.lineTo(centerPixel, height);
       ctx.stroke();

       // Center diamond
       ctx.fillStyle = '#ffffff';
       ctx.beginPath();
       ctx.moveTo(centerPixel, height / 2 - 6);
       ctx.lineTo(centerPixel + 6, height / 2);
       ctx.lineTo(centerPixel, height / 2 + 6);
       ctx.lineTo(centerPixel - 6, height / 2);
       ctx.fill();
       
       // Reset shadow
       ctx.shadowBlur = 0;
    };

    const renderLoop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // 1) Update internal playheads independently.
      // We only scrub if isPlaying. If stopped, we could sync to deck state times if dragged.
      // (For this mockup we assume simple continuous play when playing).
      if (deckA.isPlaying) playheadA += dt;
      if (deckB.isPlaying) playheadB += dt;
      
      // If either stopped, forcefully lock to state currentTime to catch scrubs.
      if (!deckA.isPlaying && deckA.buffer) playheadA = deckA.currentTime;
      if (!deckB.isPlaying && deckB.buffer) playheadB = deckB.currentTime;

      const width = canvas.width;
      const height = canvas.height;
      const halfHeight = height / 2;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw Grid lines
      drawGrid(ctx, width, halfHeight, 0, COLOR_A);
      drawGrid(ctx, width, halfHeight, halfHeight, COLOR_B);

      // Draw Waveforms
      drawWaveform(ctx, width, halfHeight, 0, COLOR_A, playheadA, deckA.duration, true);
      drawWaveform(ctx, width, halfHeight, halfHeight, COLOR_B, playheadB, deckB.duration, false);

      // Draw Static Center Playhead
      drawPlayhead(ctx, width, height);
      
      // Divider line
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, halfHeight - 1, width, 2);

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [deckA.isPlaying, deckB.isPlaying, deckA.duration, deckB.duration, deckA.currentTime, deckB.currentTime, deckA.buffer, deckB.buffer]);

  return (
    <div 
       ref={containerRef} 
       className="h-24 md:h-32 xl:h-40 w-full flex-shrink-0 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl border-b-accent/20 overflow-hidden relative"
    >
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
}
