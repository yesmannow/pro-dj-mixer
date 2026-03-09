'use client';

import { useState, useCallback } from 'react';
import { clsx } from 'clsx';

const SAMPLE_PACKS = {
  'Cyber FX': [
    { id: 1, name: 'Laser', type: 'oneshot', color: 'accent' },
    { id: 2, name: 'Impact', type: 'oneshot', color: 'rose' },
    { id: 3, name: 'Riser', type: 'loop', color: 'purple' },
    { id: 4, name: 'Drop', type: 'oneshot', color: 'yellow' },
    { id: 5, name: 'Alarm', type: 'loop', color: 'rose' },
    { id: 6, name: 'Sweep', type: 'oneshot', color: 'accent' },
    { id: 7, name: 'Glitch', type: 'oneshot', color: 'green' },
    { id: 8, name: 'Sub Drop', type: 'oneshot', color: 'blue' },
  ],
  'House Kit': [
    { id: 1, name: 'Kick', type: 'oneshot', color: 'accent' },
    { id: 2, name: 'Clap', type: 'oneshot', color: 'accent' },
    { id: 3, name: 'Hat', type: 'oneshot', color: 'accent' },
    { id: 4, name: 'Snare', type: 'oneshot', color: 'accent' },
    { id: 5, name: 'Ride', type: 'oneshot', color: 'yellow' },
    { id: 6, name: 'Crash', type: 'oneshot', color: 'yellow' },
    { id: 7, name: 'Tom', type: 'oneshot', color: 'green' },
    { id: 8, name: 'Vocal', type: 'loop', color: 'purple' },
  ]
};

const getColorClasses = (colorName: string, isPlaying: boolean) => {
  if (!isPlaying) return 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700';
  switch (colorName) {
    case 'accent': return 'border-accent bg-slate-800 scale-95 shadow-[0_0_15px_#00f2ff]';
    case 'rose': return 'border-rose-500 bg-slate-800 scale-95 shadow-[0_0_15px_#f43f5e]';
    case 'purple': return 'border-purple-500 bg-slate-800 scale-95 shadow-[0_0_15px_#a855f7]';
    case 'yellow': return 'border-yellow-500 bg-slate-800 scale-95 shadow-[0_0_15px_#eab308]';
    case 'green': return 'border-green-500 bg-slate-800 scale-95 shadow-[0_0_15px_#22c55e]';
    case 'blue': return 'border-blue-500 bg-slate-800 scale-95 shadow-[0_0_15px_#3b82f6]';
    default: return 'border-slate-400 bg-slate-800 scale-95';
  }
};

const getDotClass = (colorName: string, isPlaying: boolean) => {
  if (!isPlaying) return 'bg-slate-700';
  switch (colorName) {
    case 'accent': return 'bg-accent shadow-[0_0_5px_#00f2ff]';
    case 'rose': return 'bg-rose-500 shadow-[0_0_5px_#f43f5e]';
    case 'purple': return 'bg-purple-500 shadow-[0_0_5px_#a855f7]';
    case 'yellow': return 'bg-yellow-500 shadow-[0_0_5px_#eab308]';
    case 'green': return 'bg-green-500 shadow-[0_0_5px_#22c55e]';
    case 'blue': return 'bg-blue-500 shadow-[0_0_5px_#3b82f6]';
    default: return 'bg-white';
  }
};

export function Sampler() {
  const [activePack, setActivePack] = useState<keyof typeof SAMPLE_PACKS>('Cyber FX');
  const [playingPads, setPlayingPads] = useState<Set<number>>(new Set());

  const handlePadPress = useCallback((id: number, type: string) => {
    setPlayingPads(prev => {
      const next = new Set(prev);
      if (type === 'loop') {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.add(id);
        // Auto-release one-shots after 200ms for visual feedback
        setTimeout(() => {
          setPlayingPads(current => {
            const updated = new Set(current);
            updated.delete(id);
            return updated;
          });
        }, 200);
      }
      return next;
    });
  }, []);

  return (
    <div className="p-6 flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <h3 className="text-accent font-bold text-sm uppercase tracking-widest">Performance Sampler</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Pack</span>
          <select 
            className="bg-slate-900 border-slate-800 rounded-lg py-1.5 px-3 text-xs focus:ring-accent focus:border-accent text-slate-300 cursor-pointer font-bold"
            value={activePack}
            onChange={(e) => {
              setActivePack(e.target.value as keyof typeof SAMPLE_PACKS);
              setPlayingPads(new Set()); // Reset playing pads on pack change
            }}
          >
            {Object.keys(SAMPLE_PACKS).map(pack => (
              <option key={pack} value={pack}>{pack}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 flex-1">
        {SAMPLE_PACKS[activePack].map(pad => {
          const isPlaying = playingPads.has(pad.id);
          return (
            <button
              key={pad.id}
              onMouseDown={() => handlePadPress(pad.id, pad.type)}
              className={clsx(
                "relative rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-75 overflow-hidden min-h-[100px]",
                getColorClasses(pad.color, isPlaying)
              )}
            >
              <div className="flex items-center gap-2 z-10">
                <div className={clsx(
                  "w-2 h-2 rounded-full",
                  getDotClass(pad.color, isPlaying)
                )}></div>
                <span className={clsx(
                  "text-sm font-bold uppercase tracking-wider",
                  isPlaying ? "text-white" : "text-slate-400"
                )}>{pad.name}</span>
              </div>
              
              <span className="text-[9px] text-slate-500 uppercase font-mono z-10 tracking-widest">
                {pad.type === 'loop' ? 'LOOP' : 'ONE-SHOT'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
