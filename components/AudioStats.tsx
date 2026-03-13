'use client';

import { useEffect, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

const STATS_REFRESH_INTERVAL_MS = 1000;
const formatLatencyHint = (latencyHint: string | number) =>
  typeof latencyHint === 'number' ? `${latencyHint.toFixed(4)} s` : latencyHint;

export function AudioStats() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<ReturnType<AudioEngine['getAudioStats']> | null>(null);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const refresh = () => setStats(engine.getAudioStats());

    refresh();
    const intervalId = window.setInterval(refresh, STATS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="pointer-events-auto rounded-full border border-studio-gold/40 bg-black/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-studio-gold shadow-[0_0_18px_rgba(255,215,0,0.18)] transition hover:border-studio-gold hover:text-white"
      >
        {isOpen ? 'Hide Audio Stats' : 'Audio Stats'}
      </button>
      {isOpen && (
        <div className="pointer-events-auto min-w-[220px] rounded-2xl border border-studio-gold/30 bg-black/85 px-4 py-3 text-[11px] text-slate-200 shadow-[0_12px_36px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="oled-display mb-2 text-[10px] uppercase tracking-[0.24em] text-studio-crimson">Diagnostics</div>
          <div className="space-y-1 font-mono">
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">sampleRate</span>
              <span>{stats?.sampleRate ?? '--'} Hz</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">contextState</span>
              <span>{stats?.contextState ?? 'booting'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">latencyHint</span>
              <span>{stats ? formatLatencyHint(stats.latencyHint) : '--'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">baseLatency</span>
              <span>{stats ? `${stats.baseLatency.toFixed(4)} s` : '--'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
