'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useMixerStore } from '@/store/mixerStore';

function EQKnob({ label, value, onChange }: { label: string; value: number; onChange: (val: number) => void }) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    let newValue = startValue.current + deltaY / 50;
    newValue = Math.max(-1, Math.min(1, newValue));
    onChange(newValue);
  }, [onChange]);

  function handleMouseUp() {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = () => {
    onChange(0);
  };

  // Rotation from -135deg to +135deg
  const rotation = value * 135;

  return (
    <div className="flex flex-col gap-2 items-center">
      <div
        className="w-8 h-8 rounded-full bg-studio-slate border border-studio-gold/40 relative cursor-ns-resize group shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Active Arc Visual Feedback */}
        <div
          className="absolute -inset-1 rounded-full opacity-50 transition-opacity pointer-events-none"
          style={{
            background:
              value > 0
                ? `conic-gradient(from 0deg, #D4AF37 0deg, #D4AF37 ${value * 135}deg, transparent ${value * 135}deg)`
                : value < 0
                ? `conic-gradient(from 0deg, transparent 0deg, transparent ${360 + value * 135}deg, #E11D48 ${
                    360 + value * 135
                  }deg, #E11D48 360deg)`
                : 'transparent',
          }}
        ></div>

        {/* Knob Body */}
        <div className="absolute inset-0 rounded-full bg-studio-black z-10 border border-studio-gold/40"></div>

        {/* Indicator */}
        <div
          className="absolute inset-0 z-20"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div
            className={`absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 rounded-full ${
              value === 0 ? 'bg-slate-400' : value > 0 ? 'bg-studio-gold shadow-[0_0_5px_#D4AF37]' : 'bg-studio-crimson shadow-[0_0_5px_#E11D48]'
            }`}
          ></div>
        </div>
      </div>
      <span className="text-[9px] uppercase text-center text-slate-500">{label}</span>
    </div>
  );
}

export function Mixer() {
  const { eqA, eqB, volA, volB, crossfader, crossfaderCurve, setEQ, setVolume, setCrossfader, setCrossfaderCurve } = useMixerStore();

  const isDraggingCrossfader = useRef(false);
  const crossfaderRef = useRef<HTMLDivElement>(null);

  const isDraggingVolA = useRef(false);
  const isDraggingVolB = useRef(false);
  const volARef = useRef<HTMLDivElement>(null);
  const volBRef = useRef<HTMLDivElement>(null);

  const setVolumeFromClientY = useCallback((deckId: 'A' | 'B', clientY: number) => {
    const ref = deckId === 'A' ? volARef.current : volBRef.current;
    if (!ref) return;
    const rect = ref.getBoundingClientRect();
    const y = Math.max(rect.top, Math.min(clientY, rect.bottom));
    const ratio = (rect.bottom - y) / rect.height;
    setVolume(deckId, ratio);
  }, [setVolume]);

  const handleCrossfaderMove = useCallback((e: MouseEvent) => {
    if (!isDraggingCrossfader.current || !crossfaderRef.current) return;
    const rect = crossfaderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let newValue = (x / rect.width) * 2 - 1;
    newValue = Math.max(-1, Math.min(1, newValue));
    setCrossfader(newValue);
  }, [setCrossfader]);

  function handleCrossfaderUp() {
    isDraggingCrossfader.current = false;
    document.removeEventListener('mousemove', handleCrossfaderMove);
    document.removeEventListener('mouseup', handleCrossfaderUp);
  }

  const handleCrossfaderDown = (e: React.MouseEvent) => {
    isDraggingCrossfader.current = true;
    document.addEventListener('mousemove', handleCrossfaderMove);
    document.addEventListener('mouseup', handleCrossfaderUp);
    // Also update immediately on click
    if (crossfaderRef.current) {
      const rect = crossfaderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let newValue = (x / rect.width) * 2 - 1;
      newValue = Math.max(-1, Math.min(1, newValue));
      setCrossfader(newValue);
    }
  };

  const handleCrossfaderDoubleClick = () => {
    setCrossfader(0);
  };

  const stopVolDrag = useCallback(() => {
    isDraggingVolA.current = false;
    isDraggingVolB.current = false;
  }, []);

  const handleVolMove = useCallback((e: PointerEvent) => {
    if (isDraggingVolA.current) setVolumeFromClientY('A', e.clientY);
    if (isDraggingVolB.current) setVolumeFromClientY('B', e.clientY);
  }, [setVolumeFromClientY]);

  useEffect(() => {
    window.addEventListener('pointermove', handleVolMove);
    window.addEventListener('pointerup', stopVolDrag);
    return () => {
      window.removeEventListener('pointermove', handleVolMove);
      window.removeEventListener('pointerup', stopVolDrag);
    };
  }, [handleVolMove, stopVolDrag]);

  const startVolDrag = (deckId: 'A' | 'B') => (e: React.PointerEvent) => {
    if (deckId === 'A') isDraggingVolA.current = true;
    else isDraggingVolB.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setVolumeFromClientY(deckId, e.clientY);
  };

  // Map crossfader value (-1 to 1) to left percentage (0% to 100%)
  const crossfaderLeft = `${((crossfader + 1) / 2) * 100}%`;

  // Map volume (0..1) to top offset within fader track
  const volATop = `${(1 - volA) * 100}%`;
  const volBTop = `${(1 - volB) * 100}%`;

  return (
    <div className="bg-studio-slate/90 backdrop-blur-xl rounded-xl border border-studio-gold/20 p-4 flex flex-col items-center gap-6 transition-colors duration-300 touch-none select-none shadow-2xl">
      <div className="grid grid-cols-2 gap-8 w-full">
        <div className="flex flex-col items-center gap-4">
          <EQKnob label="High" value={eqA.high} onChange={(val) => setEQ('A', 'high', val)} />
          <EQKnob label="Mid" value={eqA.mid} onChange={(val) => setEQ('A', 'mid', val)} />
          <EQKnob label="Low" value={eqA.low} onChange={(val) => setEQ('A', 'low', val)} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <EQKnob label="High" value={eqB.high} onChange={(val) => setEQ('B', 'high', val)} />
          <EQKnob label="Mid" value={eqB.mid} onChange={(val) => setEQ('B', 'mid', val)} />
          <EQKnob label="Low" value={eqB.low} onChange={(val) => setEQ('B', 'low', val)} />
        </div>
      </div>
      <div className="flex justify-center gap-6 w-full px-4">
        <div
          ref={volARef}
          className="w-6 h-32 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
          onPointerDown={startVolDrag('A')}
          onDoubleClick={() => setVolume('A', 0.75)}
        >
          <div
            className="absolute left-0 right-0 h-8 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
            style={{ top: volATop, transform: 'translateY(-50%)' }}
          >
            <div className="w-4 h-0.5 bg-studio-black"></div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 justify-between py-2">
            <div className="w-1.5 h-1 bg-red-500"></div>
            <div className="w-1.5 h-1 bg-yellow-500"></div>
            <div className="w-1.5 h-1 bg-yellow-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
          </div>
          <div className="flex flex-col gap-1 justify-between py-2">
            <div className="w-1.5 h-1 bg-red-500"></div>
            <div className="w-1.5 h-1 bg-yellow-500"></div>
            <div className="w-1.5 h-1 bg-yellow-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
            <div className="w-1.5 h-1 bg-green-500"></div>
          </div>
        </div>
        <div
          ref={volBRef}
          className="w-6 h-32 fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
          onPointerDown={startVolDrag('B')}
          onDoubleClick={() => setVolume('B', 0.75)}
        >
          <div
            className="absolute left-0 right-0 h-8 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] cursor-pointer flex items-center justify-center"
            style={{ top: volBTop, transform: 'translateY(-50%)' }}
          >
            <div className="w-4 h-0.5 bg-studio-black"></div>
          </div>
        </div>
      </div>
      <div className="w-full px-4 mt-auto">
        <div
          className="h-8 w-full fader-track rounded-full border border-studio-gold/30 bg-studio-black relative cursor-pointer shadow-[inset_0_0_12px_rgba(0,0,0,0.6)]"
          ref={crossfaderRef}
          onMouseDown={handleCrossfaderDown}
          onDoubleClick={handleCrossfaderDoubleClick}
        >
          <div
            className="absolute top-0 bottom-0 w-10 bg-studio-gold rounded-sm border border-black shadow-[0_0_8px_#D4AF37] flex items-center justify-center"
            style={{ left: crossfaderLeft, transform: 'translateX(-50%)' }}
          >
            <div className="h-4 w-0.5 bg-studio-black pointer-events-none"></div>
          </div>
        </div>
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="inline-flex rounded-full bg-studio-black p-1 border border-studio-gold/30 text-[9px]">
            <button
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                crossfaderCurve === 'blend'
                  ? 'bg-studio-gold text-studio-black shadow-[0_0_8px_#D4AF37]'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              onClick={() => setCrossfaderCurve('blend')}
            >
              Blend
            </button>
            <button
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                crossfaderCurve === 'cut'
                  ? 'bg-studio-gold text-studio-black shadow-[0_0_8px_#D4AF37]'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
              onClick={() => setCrossfaderCurve('cut')}
            >
              Cut
            </button>
          </div>
          <p className="text-[8px] uppercase tracking-widest text-center text-slate-500">
            Crossfader ({crossfaderCurve === 'blend' ? 'Equal Power' : 'Scratch Cut'})
          </p>
        </div>
      </div>
    </div>
  );
}
