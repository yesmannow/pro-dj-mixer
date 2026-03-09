import { Drum, Flame, Music2, Waves } from 'lucide-react';
import { clsx } from 'clsx';
import type { MouseEvent, ReactNode } from 'react';

type StemType = 'drums' | 'inst' | 'vocals';

interface CuePointView {
  slot: number;
}

interface PerformancePadsProps {
  isRight: boolean;
  cuePoints: CuePointView[];
  mutedStems: Record<StemType, boolean>;
  onToggleStem: (stem: StemType) => void;
  onCueClick: (slot: number) => void;
  onCueRightClick: (event: MouseEvent, slot: number) => void;
}

const stemBySlot: Partial<Record<number, StemType>> = {
  1: 'drums',
  2: 'inst',
  3: 'vocals'
};

const getStemLabel = (stemType: StemType) => {
  if (stemType === 'drums') return 'DRUMS';
  if (stemType === 'inst') return 'INST';
  return 'VOCALS';
};

const getIconBySlot = (slot: number) => {
  if (slot === 5) return <Music2 className="w-4 h-4 opacity-20" />;
  if (slot === 6) return <Waves className="w-4 h-4 opacity-20" />;
  if (slot === 7) return <Flame className="w-4 h-4 opacity-20" />;
  if (slot === 8) return <Drum className="w-4 h-4 opacity-20" />;
  return <span className="text-[10px] font-bold opacity-20">{slot}</span>;
};

const getLitPadClasses = (isRight: boolean) =>
  isRight
    ? 'bg-deck-b text-slate-950 border-deck-b/50 shadow-[0_0_15px_rgba(225,29,72,0.35)]'
    : 'bg-deck-a text-slate-950 border-deck-a/50 shadow-[0_0_15px_rgba(212,175,55,0.35)]';

const getPadClasses = (isRight: boolean, isStemPad: boolean, isStemMuted: boolean, isCueActive: boolean) => {
  if (isStemPad) {
    if (isStemMuted) {
      return 'bg-slate-800 border-slate-900 text-slate-500 opacity-30';
    }
    return getLitPadClasses(isRight);
  }

  if (isCueActive) {
    return getLitPadClasses(isRight);
  }

  return 'bg-slate-900/70 border-slate-800 text-slate-400 hover:bg-slate-800';
};

export function PerformancePads({
  isRight,
  cuePoints,
  mutedStems,
  onToggleStem,
  onCueClick,
  onCueRightClick
}: Readonly<PerformancePadsProps>) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((slot) => {
        const stemType = stemBySlot[slot];
        const isStemPad = Boolean(stemType);
        const isCueActive = cuePoints.some((cuePoint) => cuePoint.slot === slot);
        const isStemMuted = stemType ? mutedStems[stemType] : false;
        const padClasses = getPadClasses(isRight, isStemPad, isStemMuted, isCueActive);

        let content: ReactNode = getIconBySlot(slot);
        if (stemType) {
          content = <span className="text-[10px] font-black">{getStemLabel(stemType)}</span>;
        } else if (isCueActive) {
          content = <span className="text-[10px] font-black">{slot}</span>;
        }

        return (
          <button
            key={slot}
            type="button"
            className={clsx(
              'shrink-0 h-12 rounded-md border-b-4 shadow-inner flex flex-col items-center justify-center cursor-pointer active:border-b-0 active:translate-y-1 transition-all touch-none select-none',
              padClasses
            )}
            onPointerDown={() => {
              if (stemType) {
                onToggleStem(stemType);
              }
            }}
            onClick={() => {
              if (!isStemPad) {
                onCueClick(slot);
              }
            }}
            onContextMenu={(event) => {
              if (!isStemPad) {
                onCueRightClick(event, slot);
              }
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
