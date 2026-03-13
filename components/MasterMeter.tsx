'use client';

import { useEffect, useRef } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

const clampLevel = (value: number) => Math.max(0, Math.min(1, value));

export function MasterMeter() {
  const leftFillRef = useRef<HTMLDivElement>(null);
  const rightFillRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const tick = () => {
      const { rms } = engine.getMasterEnergy();
      const level = clampLevel(rms);
      const color = level > 0.9 ? 'var(--color-studio-crimson)' : 'var(--color-studio-gold)';
      const glow = level > 0.9 ? '0 0 14px rgba(255, 0, 60, 0.65)' : '0 0 14px rgba(255, 215, 0, 0.45)';

      [leftFillRef.current, rightFillRef.current].forEach((node) => {
        if (!node) return;
        node.style.transform = `scaleY(${Math.max(0.05, level)})`;
        node.style.background = `linear-gradient(180deg, ${color} 0%, rgba(255,255,255,0.9) 8%, ${color} 100%)`;
        node.style.boxShadow = glow;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const channelClass = 'relative h-32 w-4 overflow-hidden rounded-sm border border-studio-gold/30 bg-[#050505] p-0.5';
  const fillClass = 'absolute inset-[2px] origin-bottom rounded-[2px] bg-studio-gold transition-[background,box-shadow] duration-75';

  return (
    <div className="flex items-end gap-1">
      <div className="text-[7px] text-slate-600 uppercase tracking-widest rotate-180 [writing-mode:vertical-rl] mb-1">L</div>
      <div className={channelClass}>
        <div ref={leftFillRef} className={fillClass} style={{ transform: 'scaleY(0.05)' }} />
      </div>
      <div className={channelClass}>
        <div ref={rightFillRef} className={fillClass} style={{ transform: 'scaleY(0.05)' }} />
      </div>
      <div className="text-[7px] text-slate-600 uppercase tracking-widest rotate-180 [writing-mode:vertical-rl] mb-1">R</div>
    </div>
  );
}
