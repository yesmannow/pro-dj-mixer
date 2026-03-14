import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type FxType = 'filter' | 'echo' | 'crush';

interface FXRackProps {
  deckId: 'A' | 'B';
  compact?: boolean;
  accentColor?: string;
  accentRgb?: string;
  secondaryColor?: string;
  onFxChange: (type: FxType, val: number) => void;
  onStemFxSendChange: (stem: 'vocals' | 'drums' | 'inst', active: boolean) => void;
}

interface FXKnobProps {
  label: string;
  value: number;
  color: string;
  defaultValue: number;
  onChange: (val: number) => void;
  onKill: () => void;
}

export function FXRack({ deckId, compact = false, accentColor, accentRgb, secondaryColor, onFxChange, onStemFxSendChange }: FXRackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFx, setActiveFx] = useState({ filter: 50, echo: 0, crush: 0 });
  const [stemFxTargets, setStemFxTargets] = useState({ vocals: true, drums: true, inst: true });

  const updateFx = useCallback((type: FxType, val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setActiveFx((prev) => ({ ...prev, [type]: clamped }));
    onFxChange(type, clamped);
  }, [onFxChange]);

  const killFx = useCallback((type: FxType, defaultVal: number) => {
    updateFx(type, defaultVal);
  }, [updateFx]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={compact
          ? 'w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-left text-slate-200 backdrop-blur-lg shadow-lg hover:border-white/20 transition-colors'
          : 'w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left text-slate-200 backdrop-blur-lg shadow-lg hover:border-white/20 transition-colors'}
        style={{ borderColor: `rgba(${accentRgb ?? '212,175,55'}, 0.24)` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: accentColor ?? '#38BDF8', boxShadow: `0 0 10px rgba(${accentRgb ?? '56,189,248'},0.7)` }}
          />
          <div className={compact ? 'text-[10px] font-semibold tracking-[0.2em] uppercase' : 'text-xs font-semibold tracking-[0.2em] uppercase'}>Deck {deckId} FX</div>
        </div>
        <span className="text-[11px] text-slate-400">{isOpen ? 'Hide' : 'Show'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden bg-studio-black/90 backdrop-blur-xl border-x border-b border-[#333333] rounded-b-xl shadow-2xl mt-1"
          >
            <div className={compact ? 'p-3 grid grid-cols-1 sm:grid-cols-3 gap-3' : 'p-4 grid grid-cols-1 sm:grid-cols-3 gap-4'}>
              <FXKnob label="Wash" value={activeFx.filter} onChange={(v) => updateFx('filter', v)} onKill={() => killFx('filter', 50)} color={accentColor ?? '#D4AF37'} defaultValue={50} />
              <FXKnob label="Echo" value={activeFx.echo} onChange={(v) => updateFx('echo', v)} onKill={() => killFx('echo', 0)} color="#38BDF8" defaultValue={0} />
              <FXKnob label="Crush" value={activeFx.crush} onChange={(v) => updateFx('crush', v)} onKill={() => killFx('crush', 0)} color={secondaryColor ?? '#E11D48'} defaultValue={0} />
            </div>
            <div className={compact ? 'px-3 pb-3' : 'px-4 pb-4'}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">FX Sends</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['vocals', 'VOC'],
                  ['drums', 'DRM'],
                  ['inst', 'INST'],
                ] as const).map(([stem, label]) => {
                  const active = stemFxTargets[stem];
                  return (
                    <button
                      key={stem}
                      type="button"
                      onClick={() => {
                        const nextActive = !active;
                        setStemFxTargets((prev) => ({ ...prev, [stem]: nextActive }));
                        onStemFxSendChange(stem, nextActive);
                      }}
                      className={`rounded-md border px-2 py-2 text-[10px] font-black tracking-[0.18em] transition-all ${
                        active ? 'text-studio-black shadow-[0_0_16px_rgba(255,215,0,0.28)]' : 'bg-[#090909] text-slate-400 hover:text-white'
                      }`}
                      style={{
                        borderColor: accentColor ?? '#FFD700',
                        backgroundColor: active ? accentColor ?? '#FFD700' : '#090909',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FXKnob({ label, value, onChange, onKill, color, defaultValue }: FXKnobProps) {
  const percent = Math.round(value);

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/5 border border-white/10 p-3 shadow-inner backdrop-blur-lg">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-400">{percent}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-white"
          style={{
            accentColor: color
          }}
        />
        <button
          type="button"
          onClick={onKill}
          className="px-2 py-1 rounded-md border border-white/10 text-[10px] uppercase tracking-[0.2em] text-slate-300 hover:border-white/30 hover:text-white transition-colors"
        >
          Reset
        </button>
      </div>
      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
      <div className="text-[10px] text-slate-500">
        Default {defaultValue}
      </div>
    </div>
  );
}
