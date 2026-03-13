'use client';

import { PanelTop, PanelBottom, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore } from '@/store/uiStore';

export function ViewControls({ compact = false, onOpenSettings }: Readonly<{ compact?: boolean; onOpenSettings: () => void }>) {
  const {
    isWaveformVisible,
    isLibraryVisible,
    isDeckAVisible,
    isMixerVisible,
    isDeckBVisible,
    toggleWaveform,
    toggleLibrary,
    toggleDeckA,
    toggleMixer,
    toggleDeckB,
  } = useUIStore();

  return (
    <div className={clsx(
      'z-50 flex items-center gap-2 bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl',
      compact
        ? 'absolute left-3 right-3 top-2 justify-center rounded-2xl px-2 py-1.5'
        : 'absolute top-4 right-4 rounded-full px-3 py-2'
    )}>
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
        <PanelTop className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-slate-700 mx-1"></div>

      <button
        onClick={toggleDeckA}
        className={clsx(
          'rounded-full transition-all duration-300 px-2 py-1 text-[11px] font-bold',
          isDeckAVisible
            ? 'text-accent neon-text-glow bg-accent/10'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        )}
        title="Toggle Deck A"
      >
        A
      </button>

      <button
        onClick={toggleMixer}
        className={clsx(
          'rounded-full transition-all duration-300 px-2 py-1 text-[11px] font-bold',
          isMixerVisible
            ? 'text-accent neon-text-glow bg-accent/10'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        )}
        title="Toggle Mixer"
      >
        MX
      </button>

      <button
        onClick={toggleDeckB}
        className={clsx(
          'rounded-full transition-all duration-300 px-2 py-1 text-[11px] font-bold',
          isDeckBVisible
            ? 'text-accent neon-text-glow bg-accent/10'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
        )}
        title="Toggle Deck B"
      >
        B
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
        <PanelBottom className="w-4 h-4" />
      </button>

      <div className="w-px h-4 bg-slate-700 mx-1"></div>

      <button
        onClick={onOpenSettings}
        className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all duration-300"
        title="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}
