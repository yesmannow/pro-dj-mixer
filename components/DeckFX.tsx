import { clsx } from 'clsx';
import { useState, useRef } from 'react';

interface DeckFXProps {
  side: 'left' | 'right';
}

export function DeckFX({ side }: DeckFXProps) {
  const isRight = side === 'right';

  const [xyPos, setXyPos] = useState({ x: 0.5, y: 0.5 });
  const xyRef = useRef<HTMLDivElement>(null);
  
  const [knobVal, setKnobVal] = useState(0); // 0 to 1
  const knobRef = useRef<HTMLDivElement>(null);

  const handleXyPointerChange = (e: React.PointerEvent) => {
    if (e.buttons !== 1 || !xyRef.current) return;
    const rect = xyRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setXyPos({ x, y });
  };

  const handleKnobPointerChange = (e: React.PointerEvent) => {
    if (e.buttons !== 1 || !knobRef.current) return;
    const rect = knobRef.current.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    // Map vertical throw (e.g. 100px) from 0 to 1
    const val = Math.max(0, Math.min(1, knobVal + (centerY - e.clientY) / 200));
    
    // Haptic feedback at boundaries
    if ((val === 0 && knobVal > 0) || (val === 1 && knobVal < 1)) {
       if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
    }
    
    setKnobVal(val);
  };

  return (
    <div
      className={clsx(
        'col-span-12 lg:col-span-5 bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex gap-6 items-center transition-colors duration-300',
        isRight && 'flex-row-reverse'
      )}
    >
      <div className="flex flex-col gap-2">
        <div
          className={clsx(
            'text-[10px] uppercase tracking-widest text-slate-500 font-bold',
            isRight && 'text-right'
          )}
        >
          Filter / Reverb XY
        </div>
        <div 
          ref={xyRef}
          onPointerDown={handleXyPointerChange}
          onPointerMove={handleXyPointerChange}
          className="w-32 h-32 bg-black/60 rounded-lg border border-slate-700 relative overflow-hidden cursor-crosshair touch-none select-none group"
        >
          <div className="absolute inset-0 opacity-10 group-active:opacity-30 transition-opacity">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, #00f2ff 1px, transparent 1px)',
                backgroundSize: '10px 10px',
              }}
            ></div>
          </div>
          <div
            className="absolute w-4 h-4 rounded-full border border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform shadow-[0_0_15px_rgba(0,242,255,0.8)]"
            style={{ 
              left: `${xyPos.x * 100}%`, 
              top: `${xyPos.y * 100}%`,
              backgroundColor: isRight ? '#f000ff' : '#00f2ff',
            }}
          ></div>
          <div
            className={clsx(
              'absolute w-2 h-2 rounded-full pointer-events-none shadow-[0_0_10px_currentColor] mix-blend-screen scale-150',
              isRight ? 'bg-[#f000ff]' : 'bg-[#00f2ff]'
            )}
            style={{ left: `${xyPos.x * 100}%`, top: `${xyPos.y * 100}%`, transform: 'translate(-50%, -50%)' }}
          ></div>
          <div
            className={clsx(
              'absolute text-[8px] text-slate-600 select-none pointer-events-none',
              isRight ? 'bottom-1 right-2' : 'bottom-1 left-2'
            )}
          >
            CUTOFF
          </div>
          <div
            className={clsx(
              'absolute text-[8px] text-slate-600',
              isRight ? 'top-2 left-1 -rotate-90' : 'top-2 right-1 rotate-90'
            )}
          >
            REVERB
          </div>
        </div>
      </div>
      <div
        className={clsx(
          'flex-1 flex flex-col justify-between h-32 py-1',
          isRight && 'items-end'
        )}
      >
        <div className={clsx('flex flex-col gap-2', isRight && 'items-end')}>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            Stem Focus
          </div>
          <div className="flex gap-2">
            <button
              className={clsx(
                'px-2 py-1 rounded border text-[9px] font-bold',
                !isRight
                  ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              VOCALS
            </button>
            <button
              className={clsx(
                'px-2 py-1 rounded border text-[9px] font-bold',
                isRight
                  ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              DRUMS
            </button>
          </div>
        </div>
        <div className={clsx('flex flex-col gap-2', isRight && 'items-end')}>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
            Performance FX
          </div>
          <div className="flex gap-1.5">
            <button className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              BEATMASHER
            </button>
            <button className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              RAMP DELAY
            </button>
            <button className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              VINYL STOP
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
          Build-up
        </div>
        <div 
          ref={knobRef}
          onPointerDown={handleKnobPointerChange}
          onPointerMove={handleKnobPointerChange}
          className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 relative flex items-center justify-center cursor-pointer hover:border-accent transition-colors touch-none select-none group"
        >
          <div className="absolute inset-1 rounded-full border border-dashed border-slate-600 group-hover:border-accent/40 group-active:border-accent transition-colors"></div>
          {/* Knob Rotation Logic: 0 -> -135deg, 1 -> +135deg */}
          <div
            className="w-full h-full absolute inset-0 flex items-start justify-center transition-transform"
            style={{ transform: `rotate(${knobVal * 270 - 135}deg)` }}
          >
            <div
              className={clsx(
                'w-1.5 h-4 mt-2 rounded-full shadow-[0_0_10px_rgba(0,242,255,0.6)]',
                isRight ? 'bg-[#f000ff]' : 'bg-[#00f2ff]',
                knobVal > 0.05 ? 'shadow-[0_0_20px_currentColor]' : ''
              )}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
