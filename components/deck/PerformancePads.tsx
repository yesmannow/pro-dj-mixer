import { useState } from 'react';
import { clsx } from 'clsx';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface CuePointView {
  slot: number;
  time: number;
}

interface PerformancePadsProps {
  deckId: 'A' | 'B';
  cuePoints: CuePointView[];
  shiftHeld: boolean;
  pressedSlots: Set<number>;
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
  onPadHold,
  onPadRelease,
  onClearCue,
  onAutoGenerate,
}: Readonly<PerformancePadsProps>) {
  const labelSet = keyLabels[deckId];
  const [pointerPressed, setPointerPressed] = useState<Set<number>>(new Set());

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="w-full h-10 rounded-md border border-[#2a2a2a] bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] text-[11px] font-black tracking-widest text-slate-200 shadow-[0_4px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] active:translate-y-[1px] active:shadow-[0_2px_0_#000,inset_0_1px_0_rgba(255,255,255,0.05)] transition-all"
        onClick={onAutoGenerate}
      >
        AUTO 16-BAR
      </button>

      <div className="mpc-grid-container grid grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => {
          const cue = cuePoints.find((c) => c.slot === slot);
          const isActive = Boolean(cue);
          const label = labelSet[slot] ?? '';
          const isPressed = pressedSlots.has(slot) || pointerPressed.has(slot);

          const padClasses = clsx(
            'mpc-pad relative overflow-hidden touch-none select-none focus:outline-none',
            deckId === 'A' ? 'mpc-pad-set-A' : 'mpc-pad-set-B',
            isPressed && 'mpc-pad-pressed',
            shiftHeld && isActive && 'del-mode'
          );

          return (
            <MagneticButton
              key={slot}
              type="button"
              whileTap={{ scale: 0.95 }}
              className={padClasses}
              onPointerDown={(e) => {
                e.preventDefault();
                setPointerPressed((prev) => {
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
              onPointerUp={(e) => {
                e.preventDefault();
                setPointerPressed((prev) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (shiftHeld) return;
                onPadRelease(slot);
              }}
              onPointerLeave={() => {
                setPointerPressed((prev) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (!shiftHeld) onPadRelease(slot);
              }}
              onPointerCancel={() => {
                setPointerPressed((prev) => {
                  const next = new Set(prev);
                  next.delete(slot);
                  return next;
                });
                if (!shiftHeld) onPadRelease(slot);
              }}
            >
              <span className="absolute top-1 left-1 text-[8px] uppercase tracking-[0.12em] text-gray-600">
                {label}
              </span>
              {shiftHeld && isActive ? (
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-red-200">DEL</span>
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-200">
                  {isActive ? `CUE ${slot}` : 'EMPTY'}
                </span>
              )}
              <div className="absolute bottom-1 right-1 text-[8px] text-gray-500">{slot}</div>
            </MagneticButton>
          );
        })}
      </div>
    </div>
  );
}
