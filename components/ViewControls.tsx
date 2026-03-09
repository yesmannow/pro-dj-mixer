'use client';

import { Activity, SlidersHorizontal, ListMusic } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore } from '@/store/uiStore';

export function ViewControls() {
  const { 
    isWaveformVisible, 
    isFxDockVisible, 
    isLibraryVisible, 
    toggleWaveform, 
    toggleFxDock, 
    toggleLibrary 
  } = useUIStore();

  return (
    <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-full px-3 py-2 shadow-2xl">
      <button 
        onClick={toggleWaveform}
        className={clsx(
          "p-1.5 rounded-full transition-all duration-300",
          isWaveformVisible 
            ? "text-accent neon-text-glow bg-accent/10" 
            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
        )}
        title="Toggle Waveforms"
      >
        <Activity className="w-4 h-4" />
      </button>
      
      <div className="w-px h-4 bg-slate-700 mx-1"></div>
      
      <button 
        onClick={toggleLibrary}
        className={clsx(
          "p-1.5 rounded-full transition-all duration-300",
          isLibraryVisible 
            ? "text-accent neon-text-glow bg-accent/10" 
            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
        )}
        title="Toggle Library"
      >
        <ListMusic className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-slate-700 mx-1"></div>
      
      <button 
        onClick={toggleFxDock}
        className={clsx(
          "p-1.5 rounded-full transition-all duration-300",
          isFxDockVisible 
            ? "text-accent neon-text-glow bg-accent/10" 
            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
        )}
        title="Toggle FX Dock"
      >
        <SlidersHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}
