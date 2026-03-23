import { useState } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import type { PerformancePadMode } from '@/hooks/usePerformanceFX';

interface CuePointView {
  slot: number;
  time: number;
}

interface PerformancePadsProps {
  deckId: 'A' | 'B';
  cuePoints: CuePointView[];
  shiftHeld: boolean;
  pressedSlots: Set<number>;
  compact?: boolean;
  accentColor?: string;
  accentRgb?: string;
  padMode: PerformancePadMode;
  onPadModeChange: (mode: PerformancePadMode) => void;
  onPadHold: (slot: number) => void;
  onPadRelease: (slot: number) => void;
  onClearCue: (slot: number) => void;
  onAutoGenerate: () => void;
}

const keyLabels: Record<'A' | 'B', string[]> = {
  A: ['1', '2', '3', '4', '5', '6', '7', '8'],
  B: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'],
};

export function PerformancePads({
  deckId,
  cuePoints,
  shiftHeld,
  pressedSlots,
  compact = false,
  accentColor,
  accentRgb,
  padMode,
  onPadModeChange,
  onPadHold,
  onPadRelease,
  onClearCue,
  onAutoGenerate,
}: Readonly<PerformancePadsProps>) {
  const labelSet = keyLabels[deckId];
  const [pointerPressed, setPointerPressed] = useState<Set<number>>(new Set());
  const getPadDisplay = (slot: number, isActive: boolean) => {
    if (padMode === 'slip-roll') {
      const division = slot < 4 ? '1/4' : '1/8';
      return isActive ? `ROLL ${division}` : division;
    }

    if (padMode === 'beat-break') {
      return isActive ? `BREAK ${slot}` : 'BREAK';
    }

    return isActive ? `CUE ${slot}` : 'EMPTY';
  };

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}>
      <button
        type="button"
        className={compact
          ? 'w-full h-8 rounded-md border border-[#2a2a2a] bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] text-[10px] font-black tracking-[0.2em] text-slate-200 shadow-[0_4px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] active:translate-y-[1px] active:shadow-[0_2px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] transition-all'
          : 'w-full h-10 rounded-md border border-[#2a2a2a] bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] text-[11px] font-black tracking-widest text-slate-200 shadow-[0_4px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] active:translate-y-[1px] active:shadow-[0_2px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] transition-all'}
        style={{
          borderColor: accentColor ?? '#2a2a2a',
          color: accentColor ?? '#e2e8f0',
          boxShadow: `0 4px 0 #000,inset 0 1px 0 rgba(255,255,255,0.05),0 0 18px rgba(${accentRgb ?? '212,175,55'},0.18)`,
        }}
        onClick={onAutoGenerate}
      >
        AUTO 10-BAR
      </button>

      <div className={compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 gap-2'}>
        {([
          ['hot', 'HOT'],
          ['slip-roll', 'ROLL'],
          ['beat-break', 'BREAK'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onPadModeChange(mode)}
            className={clsx(
              'rounded-md border font-black tracking-[0.18em] transition-all',
              compact ? 'h-7 text-[9px]' : 'h-8 text-[10px]',
              padMode === mode
                ? 'text-studio-black shadow-[0_0_16px_rgba(255,215,0,0.38)] neon-glow'
                : 'text-slate-300 bg-[#090909] hover:text-white'
            )}
            style={{
              borderColor: accentColor ?? '#FFD700',
              backgroundColor: padMode === mode ? accentColor ?? '#FFD700' : '#090909',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={compact ? 'mpc-grid-container grid grid-cols-4 gap-1.5 p-2' : 'mpc-grid-container grid grid-cols-4 gap-2'}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => {
          const cue = cuePoints.find((c) => c.slot === slot);
          const isActive = Boolean(cue);
          const label = labelSet[slot] ?? '';
          const isPressed = pressedSlots.has(slot) || pointerPressed.has(slot);

          const padClasses = clsx(
            'mpc-pad relative overflow-hidden touch-none select-none focus:outline-none',
            isPressed && 'mpc-pad-pressed',
            isActive && !isPressed && 'mpc-pad-active',
            shiftHeld && isActive && 'del-mode'
          );

          return (
            <motion.button
              key={slot}
              type="button"
              whileTap={{ scale: 0.93 }}
              className={padClasses}
              style={{
                borderColor: accentColor ?? (deckId === 'A' ? '#FFD700' : '#FF003C'),
                ['--deck-primary' as string]: accentColor ?? (deckId === 'A' ? '#FFD700' : '#FF003C'),
              }}
              onPointerDown={(e) => {
                setPointerPressed((prev: Set<number>) => {
                  const next = new Set(prev);
                  next.add(slot);
                  return next;
                });
                if (shiftHeld) {
                  if (isActive) onClearCue(slot);
                  return;
                }
                onPadHold(slot);
              }}
              onPointerUp={() => {
                setPointerPressed((prev: Set<number>) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (shiftHeld) return;
                onPadRelease(slot);
              }}
              onPointerLeave={() => {
                setPointerPressed((prev: Set<number>) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (!shiftHeld) onPadRelease(slot);
              }}
              onPointerCancel={() => {
                setPointerPressed((prev: Set<number>) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (!shiftHeld) onPadRelease(slot);
              }}
            >
              <span className={compact ? 'absolute top-0.5 left-1 text-[7px] uppercase tracking-[0.08em] text-gray-600' : 'absolute top-1 left-1 text-[8px] uppercase tracking-[0.12em] text-gray-600'}>
                {label}
              </span>
              {shiftHeld && isActive ? (
                <span className={compact ? 'absolute inset-0 flex items-center justify-center text-[9px] font-black text-red-200' : 'absolute inset-0 flex items-center justify-center text-[11px] font-black text-red-200'}>DEL</span>
              ) : (
                <span className={compact ? 'absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-200' : 'absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-200'}>
                  {getPadDisplay(slot, isActive)}
                </span>
              )}
              <div className={compact ? 'absolute bottom-0.5 right-0.5 text-[7px] text-gray-500' : 'absolute bottom-1 right-1 text-[8px] text-gray-500'}>{slot}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
