import { clsx } from 'clsx';

interface PitchFaderProps {
  pitchPercent: number;
  temporaryPitch: number;
  isSynced: boolean;
  onPitchChange: (nextPitchPercent: number) => void;
  onDisableSync: () => void;
  onNudgeDownStart: () => void;
  onNudgeDownEnd: () => void;
  onNudgeUpStart: () => void;
  onNudgeUpEnd: () => void;
}

export function PitchFader({
  pitchPercent,
  temporaryPitch,
  isSynced,
  onPitchChange,
  onDisableSync,
  onNudgeDownStart,
  onNudgeDownEnd,
  onNudgeUpStart,
  onNudgeUpEnd
}: Readonly<PitchFaderProps>) {
  const displayedPitch = pitchPercent + temporaryPitch;
  const isAtZero = Math.abs(pitchPercent) < 0.001;
  const markerClass = isAtZero ? 'bg-lime-400 shadow-[0_0_8px_#22c55e]' : 'bg-slate-700';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Pitch</div>
      <div className="relative h-32 w-8 fader-track rounded-full border border-slate-800 bg-slate-950/40 flex items-center justify-center">
        <div className="absolute inset-x-2 h-0.5 bg-slate-600" />
        <div className={clsx('absolute -left-1 w-2 h-2 rounded-full transition-all', markerClass)} />
        <input
          type="range"
          min={-8}
          max={8}
          step={0.1}
          value={displayedPitch}
          onChange={(event) => {
            const raw = Number.parseFloat(event.target.value) - temporaryPitch;
            const snapped = raw > -0.8 && raw < 0.8 ? 0 : raw;
            onPitchChange(snapped);
            if (isSynced) {
              onDisableSync();
            }
          }}
          className="appearance-none w-full h-24 rotate-[-90deg] outline-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_6px_#00f2ff]"
        />
      </div>
      <div className="font-mono text-[10px] text-slate-300">{displayedPitch.toFixed(2)}%</div>
      <div className="flex gap-1">
        <button
          type="button"
          className="w-6 h-6 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          onPointerDown={onNudgeDownStart}
          onPointerUp={onNudgeDownEnd}
          onPointerLeave={onNudgeDownEnd}
        >
          -
        </button>
        <button
          type="button"
          className="w-6 h-6 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          onPointerDown={onNudgeUpStart}
          onPointerUp={onNudgeUpEnd}
          onPointerLeave={onNudgeUpEnd}
        >
          +
        </button>
      </div>
    </div>
  );
}
