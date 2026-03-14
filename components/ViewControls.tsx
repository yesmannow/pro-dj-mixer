'use client';

import { useState, useCallback, useEffect } from 'react';
import { PanelTop, PanelBottom, Maximize, Minimize } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore } from '@/store/uiStore';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ViewControls({ compact = false }: Readonly<{ compact?: boolean }>) {
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

  const { isRecording, elapsedSeconds, startRecording, stopRecording } = useMediaRecorder();

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen may be blocked by browser policy or missing user gesture
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keep isFullscreen in sync with external fullscreen changes (e.g. user presses Esc)
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

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

      {/* Record button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={clsx(
          'flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold transition-all duration-200',
          isRecording
            ? 'bg-red-900/40 border border-red-500/60 text-red-400 hover:bg-red-900/60'
            : 'text-slate-500 hover:text-red-400 hover:bg-slate-800 border border-transparent'
        )}
        title={isRecording ? 'Stop Recording' : 'Record Mix'}
      >
        <span
          className={clsx(
            'inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0',
            isRecording && 'record-led-blink'
          )}
        />
        {isRecording ? (
          <span className="oled-display tabular-nums">{formatElapsed(elapsedSeconds)}</span>
        ) : (
          <span>REC</span>
        )}
      </button>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all duration-300"
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>
    </div>
  );
}
