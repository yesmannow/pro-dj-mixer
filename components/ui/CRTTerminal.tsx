'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CRTTerminalProps {
  children: React.ReactNode;
}

export function CRTTerminal({ children }: CRTTerminalProps) {
  const [mounted] = useState(() => typeof window !== 'undefined');
  const [stage, setStage] = useState<'idle' | 'flash' | 'bloom' | 'steady'>(() => (typeof window !== 'undefined' ? 'flash' : 'idle'));

  useEffect(() => {
    if (!mounted) return undefined;
    const bloomTimer = setTimeout(() => setStage('bloom'), 220);
    const settleTimer = setTimeout(() => setStage('steady'), 900);
    return () => {
      clearTimeout(bloomTimer);
      clearTimeout(settleTimer);
    };
  }, [mounted]);

  const stripeHeight = useMemo(() => {
    if (!mounted || typeof window === 'undefined') return 4;
    return window.devicePixelRatio >= 2 ? 8 : 4;
  }, [mounted]);

  const brightness = stage === 'bloom' ? 5 : 1;
  const scaleY = stage === 'flash' ? 0.04 : 1.02;

  return (
    <div className="relative isolate bg-[#050505] text-slate-100 overflow-hidden">
      {/* Boot beam */}
      <AnimatePresence>
        {stage !== 'steady' && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0.01 }}
            animate={{ opacity: stage === 'flash' ? 1 : 0, scaleY: scaleY }}
            exit={{ opacity: 0 }}
            transition={{ duration: stage === 'flash' ? 0.18 : 0.35, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none z-40"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)' }}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      <motion.div
        animate={{ filter: `brightness(${brightness})`, scaleY: stage === 'bloom' ? 1.04 : 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10"
      >
        {children}
      </motion.div>

      {/* Scanlines */}
      <div
        className="pointer-events-none absolute inset-0 z-20 mix-blend-screen crt-scanlines animate-scanline-scroll"
        style={{
          backgroundSize: `100% ${stripeHeight}px`,
        }}
      />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(5,5,5,0) 0%, rgba(5,5,5,0.25) 55%, rgba(5,5,5,0.55) 100%)',
        }}
      />

      {/* Hum bar */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        <div className="w-full h-[18%] bg-gradient-to-b from-transparent via-[rgba(5,5,5,0.45)] to-transparent blur-[12px] opacity-60 animate-hum-bar" />
      </div>
    </div>
  );
}
