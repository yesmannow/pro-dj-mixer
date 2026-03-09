import { clsx } from 'clsx';
import { useRef } from 'react';
import { AudioEngine } from '@/lib/audioEngine';
import { useDeckStore } from '@/store/deckStore';

interface DeckFXProps {
  side: 'left' | 'right';
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function DeckFX({ side }: Readonly<DeckFXProps>) {
  const isRight = side === 'right';
  const deckId: 'A' | 'B' = isRight ? 'B' : 'A';
  const bpm = useDeckStore((state) => {
    const trackBpm = isRight ? state.deckB.track?.bpm : state.deckA.track?.bpm;
    const parsed = Number(trackBpm);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
  });

  const xyRef = useRef<HTMLDivElement>(null);
  const xyReticleRef = useRef<HTMLDivElement>(null);
  const xyGlowRef = useRef<HTMLDivElement>(null);
  const xyPosRef = useRef({ x: 0.5, y: 0.5 });
  const activeXyPointerIdRef = useRef<number | null>(null);

  const knobRef = useRef<HTMLDivElement>(null);
  const knobNeedleRef = useRef<HTMLDivElement>(null);
  const knobValueRef = useRef(0);
  const activeKnobPointerIdRef = useRef<number | null>(null);

  const applyFx = (x: number, y: number) => {
    const engine = AudioEngine.getInstance();
    const beatHalfTime = 60 / bpm / 2;
    const feedback = 0.15 + (1 - y) * 0.75;
    engine.setDeckDelay(deckId, beatHalfTime, feedback, x);
    engine.setDeckReverb(deckId, x * 0.65);
  };

  const updateXyVisual = (x: number, y: number) => {
    if (xyReticleRef.current) {
      xyReticleRef.current.style.left = `${x * 100}%`;
      xyReticleRef.current.style.top = `${y * 100}%`;
    }
    if (xyGlowRef.current) {
      xyGlowRef.current.style.left = `${x * 100}%`;
      xyGlowRef.current.style.top = `${y * 100}%`;
    }
  };

  const updateXyFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!xyRef.current) return;
    const rect = xyRef.current.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    xyPosRef.current = { x, y };
    updateXyVisual(x, y);
    applyFx(x, y);
  };

  const updateKnobVisual = (value: number) => {
    if (knobNeedleRef.current) {
      knobNeedleRef.current.style.transform = `rotate(${value * 270 - 135}deg)`;
    }
  };

  return (
    <div
      className={clsx(
        'col-span-12 lg:col-span-5 bg-slate-900/60 rounded-xl border border-slate-800 p-4 flex gap-6 items-center transition-colors duration-300',
        isRight ? 'flex-row-reverse' : ''
      )}
    >
      <div className="flex flex-col gap-2">
        <div className={clsx('text-[10px] uppercase tracking-widest text-slate-500 font-bold', isRight ? 'text-right' : '')}>
          Delay / Reverb XY
        </div>
        <div
          ref={xyRef}
          onPointerDown={(event) => {
            activeXyPointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateXyFromEvent(event);
          }}
          onPointerMove={(event) => {
            if (activeXyPointerIdRef.current !== event.pointerId) return;
            updateXyFromEvent(event);
          }}
          onPointerUp={(event) => {
            if (activeXyPointerIdRef.current !== event.pointerId) return;
            activeXyPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (activeXyPointerIdRef.current !== event.pointerId) return;
            activeXyPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          className="w-32 h-32 bg-black/60 rounded-lg border border-slate-700 relative overflow-hidden cursor-crosshair touch-none select-none group"
        >
          <div className="absolute inset-0 opacity-10 group-active:opacity-30 transition-opacity">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle, #00f2ff 1px, transparent 1px)',
                backgroundSize: '10px 10px'
              }}
            />
          </div>
          <div
            ref={xyReticleRef}
            className="absolute w-4 h-4 rounded-full border border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform shadow-[0_0_15px_rgba(0,242,255,0.8)]"
            style={{
              left: '50%',
              top: '50%',
              backgroundColor: isRight ? '#f000ff' : '#00f2ff'
            }}
          />
          <div
            ref={xyGlowRef}
            className={clsx(
              'absolute w-2 h-2 rounded-full pointer-events-none shadow-[0_0_10px_currentColor] mix-blend-screen scale-150 -translate-x-1/2 -translate-y-1/2',
              isRight ? 'bg-[#f000ff]' : 'bg-[#00f2ff]'
            )}
            style={{ left: '50%', top: '50%' }}
          />
          <div className={clsx('absolute text-[8px] text-slate-600 select-none pointer-events-none', isRight ? 'bottom-1 right-2' : 'bottom-1 left-2')}>
            WET
          </div>
          <div className={clsx('absolute text-[8px] text-slate-600', isRight ? 'top-2 left-1 -rotate-90' : 'top-2 right-1 rotate-90')}>
            FEEDBACK
          </div>
        </div>
      </div>
      <div className={clsx('flex-1 flex flex-col justify-between h-32 py-1', isRight ? 'items-end' : '')}>
        <div className={clsx('flex flex-col gap-2', isRight ? 'items-end' : '')}>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Stem Focus</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={clsx(
                'px-2 py-1 rounded border text-[9px] font-bold',
                !isRight ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' : 'border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              VOCALS
            </button>
            <button
              type="button"
              className={clsx(
                'px-2 py-1 rounded border text-[9px] font-bold',
                isRight ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20' : 'border-slate-700 text-slate-400 hover:border-slate-500'
              )}
            >
              DRUMS
            </button>
          </div>
        </div>
        <div className={clsx('flex flex-col gap-2', isRight ? 'items-end' : '')}>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Performance FX</div>
          <div className="flex gap-1.5">
            <button type="button" className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              BEATMASHER
            </button>
            <button type="button" className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              RAMP DELAY
            </button>
            <button type="button" className="px-2 py-1 bg-slate-800 rounded text-[8px] text-slate-300 font-medium hover:bg-slate-700">
              VINYL STOP
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Build-up</div>
        <div
          ref={knobRef}
          onPointerDown={(event) => {
            activeKnobPointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (activeKnobPointerIdRef.current !== event.pointerId) return;
            const delta = -event.movementY / 180;
            const next = clamp01(knobValueRef.current + delta);
            knobValueRef.current = next;
            updateKnobVisual(next);
            const x = xyPosRef.current.x;
            const y = clamp01(1 - next);
            applyFx(x, y);
          }}
          onPointerUp={(event) => {
            if (activeKnobPointerIdRef.current !== event.pointerId) return;
            activeKnobPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (activeKnobPointerIdRef.current !== event.pointerId) return;
            activeKnobPointerIdRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          className="w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-700 relative flex items-center justify-center cursor-pointer hover:border-accent transition-colors touch-none select-none group"
        >
          <div className="absolute inset-1 rounded-full border border-dashed border-slate-600 group-hover:border-accent/40 group-active:border-accent transition-colors" />
          <div ref={knobNeedleRef} className="w-full h-full absolute inset-0 flex items-start justify-center" style={{ transform: 'rotate(-135deg)' }}>
            <div className={clsx('w-1.5 h-4 mt-2 rounded-full shadow-[0_0_10px_rgba(0,242,255,0.6)]', isRight ? 'bg-[#f000ff]' : 'bg-[#00f2ff]')} />
          </div>
        </div>
      </div>
    </div>
  );
}
