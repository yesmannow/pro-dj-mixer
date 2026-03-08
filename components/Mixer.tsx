'use client';

import { useState, useRef, useCallback } from 'react';

function EQKnob({ label, initialValue = 0 }: { label: string; initialValue?: number }) {
  const [value, setValue] = useState(initialValue); // -1 to 1
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    let newValue = startValue.current + deltaY / 50;
    newValue = Math.max(-1, Math.min(1, newValue));
    setValue(newValue);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = () => {
    setValue(0);
  };

  // Rotation from -135deg to +135deg
  const rotation = value * 135;

  return (
    <div className="flex flex-col gap-2 items-center">
      <div
        className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 relative cursor-ns-resize group"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Active Arc Visual Feedback */}
        <div
          className="absolute -inset-1 rounded-full opacity-50 transition-opacity pointer-events-none"
          style={{
            background:
              value > 0
                ? `conic-gradient(from 0deg, #00f2ff 0deg, #00f2ff ${value * 135}deg, transparent ${value * 135}deg)`
                : value < 0
                ? `conic-gradient(from 0deg, transparent 0deg, transparent ${360 + value * 135}deg, #f43f5e ${
                    360 + value * 135
                  }deg, #f43f5e 360deg)`
                : 'transparent',
          }}
        ></div>

        {/* Knob Body */}
        <div className="absolute inset-0 rounded-full bg-slate-800 z-10 border border-slate-600"></div>

        {/* Indicator */}
        <div
          className="absolute inset-0 z-20"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div
            className={`absolute top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 rounded-full ${
              value === 0 ? 'bg-slate-400' : value > 0 ? 'bg-accent shadow-[0_0_5px_#00f2ff]' : 'bg-rose-500 shadow-[0_0_5px_#f43f5e]'
            }`}
          ></div>
        </div>
      </div>
      <span className="text-[9px] uppercase text-center text-slate-500">{label}</span>
    </div>
  );
}

export function Mixer() {
  return (
    <div className="col-span-12 lg:col-span-2 bg-primary/60 rounded-xl border border-slate-800 p-4 flex flex-col items-center gap-6">
      <div className="grid grid-cols-2 gap-8 w-full">
        <div className="flex flex-col items-center gap-4">
          <EQKnob label="High" initialValue={0.2} />
          <EQKnob label="Mid" initialValue={-0.1} />
          <EQKnob label="Low" initialValue={0.5} />
        </div>
        <div className="flex flex-col items-center gap-4">
          <EQKnob label="High" initialValue={0} />
          <EQKnob label="Mid" initialValue={0.4} />
          <EQKnob label="Low" initialValue={-0.3} />
        </div>
      </div>
      <div className="flex justify-center gap-6 w-full px-4">
        <div className="w-6 h-32 fader-track rounded-full border border-slate-800 relative">
          <div className="absolute top-10 left-0 right-0 h-8 bg-slate-400 rounded-sm border border-slate-300 shadow-lg cursor-pointer flex items-center justify-center">
            <div className="w-4 h-0.5 bg-slate-600"></div>
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
        <div className="w-6 h-32 fader-track rounded-full border border-slate-800 relative">
          <div className="absolute bottom-4 left-0 right-0 h-8 bg-slate-400 rounded-sm border border-slate-300 shadow-lg cursor-pointer flex items-center justify-center">
            <div className="w-4 h-0.5 bg-slate-600"></div>
          </div>
        </div>
      </div>
      <div className="w-full px-4 mt-auto">
        <div className="h-8 w-full fader-track rounded-full border border-slate-800 relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-10 bg-slate-400 rounded-sm border border-slate-300 shadow-lg cursor-pointer flex items-center justify-center">
            <div className="h-4 w-0.5 bg-slate-600"></div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1 mt-2">
          <div className="w-1 h-1 rounded-full bg-accent animate-pulse shadow-[0_0_5px_#00f2ff]"></div>
          <span className="text-[7px] text-accent font-bold uppercase tracking-tighter">
            Crossfader Fusion™ Active
          </span>
        </div>
        <p className="text-[8px] uppercase tracking-widest text-center mt-2 text-slate-500">
          Crossfader
        </p>
      </div>
    </div>
  );
}
