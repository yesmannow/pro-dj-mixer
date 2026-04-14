'use client';

import { useUIStore } from '@/store/uiStore';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function RecordingStatusBar() {
  const { isRecording } = useUIStore();
  const { elapsedSeconds } = useMediaRecorder();

  return (
    <AnimatePresence>
      {isRecording && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-4 px-6 py-2 bg-[#050505]/90 backdrop-blur-2xl border-x border-b border-red-500/30 rounded-b-2xl shadow-[0_0_30px_rgba(239,68,68,0.2)]"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <span className="text-[10px] font-black tracking-[0.3em] text-red-500 uppercase">Recording Master</span>
          </div>
          
          <div className="w-px h-4 bg-white/10" />
          
          <div className="flex items-center gap-3">
            <span className="text-xl font-mono font-bold text-white tabular-nums drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              {formatElapsed(elapsedSeconds)}
            </span>
            <div className="flex gap-1 h-3 items-end">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: [4, 12, 6, 10, 4][i % 5],
                    opacity: [0.3, 1, 0.5, 0.8, 0.3][i % 5]
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 0.8 + i * 0.1,
                    ease: "easeInOut" 
                  }}
                  className="w-1 bg-red-500 rounded-full"
                />
              ))}
            </div>
          </div>

          <div className="w-px h-4 bg-white/10" />

          <div className="flex flex-col">
            <span className="text-[8px] text-white/40 uppercase tracking-widest leading-none">Quality</span>
            <span className="text-[9px] text-red-400/80 font-mono font-bold uppercase">24-bit WAV</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
