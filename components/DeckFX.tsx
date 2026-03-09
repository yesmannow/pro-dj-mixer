import { clsx } from 'clsx';

interface DeckFXProps {
  side: 'left' | 'right';
}

export function DeckFX({ side }: DeckFXProps) {
  const isRight = side === 'right';

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
        <div className="w-32 h-32 bg-black/60 rounded-lg border border-slate-700 relative overflow-hidden cursor-crosshair">
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, #00f2ff 1px, transparent 1px)',
                backgroundSize: '10px 10px',
              }}
            ></div>
          </div>
          <div
            className={clsx(
              'absolute w-3 h-3 bg-accent rounded-full neon-glow -translate-x-1/2 -translate-y-1/2 shadow-[0_0_10px_#00f2ff]',
              isRight ? 'bottom-1/3 right-1/4' : 'top-1/2 left-1/4'
            )}
          ></div>
          <div
            className={clsx(
              'absolute text-[8px] text-slate-600',
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
        <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 relative flex items-center justify-center cursor-pointer hover:border-accent transition-colors">
          <div className="absolute inset-1 rounded-full border border-dashed border-accent/20"></div>
          <div
            className={clsx(
              'w-1 h-6 bg-accent rounded-full shadow-[0_0_15px_#00f2ff] origin-bottom mb-4',
              isRight ? 'rotate-12' : '-rotate-45'
            )}
          ></div>
        </div>
      </div>
    </div>
  );
}
