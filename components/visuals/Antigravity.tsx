'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';
import { Particle } from '@/lib/visuals/Particle';

const TOTAL_PARTICLES = 80;

export function Antigravity() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const [mounted] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const engine = AudioEngine.getInstance();

    // init particles
    particlesRef.current = Array.from({ length: TOTAL_PARTICLES }).map((_, i) => new Particle(canvas.width, canvas.height, i % 3 === 0));

    const render = () => {
      const { low } = engine.getMasterEnergy();
      const bassEnergy = Math.min(1, low); // normalized 0..1

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      for (const p of particlesRef.current) {
        p.update(canvas.width, canvas.height, bassEnergy);
        p.draw(ctx);
      }

      ctx.globalCompositeOperation = 'source-over';
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mounted]);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 pointer-events-none" />;
}
