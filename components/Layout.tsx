'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronUp, Zap } from 'lucide-react';
import { clsx } from 'clsx';

interface LayoutProps {
  isPerformanceMode: boolean;
  onTogglePerformanceMode: () => void;
  isWaveformVisible: boolean;
  onToggleWaveform: () => void;
  isRemixOpen: boolean;
  onToggleRemix: () => void;
  phraseBadges?: ReactNode;
  waveformContent: ReactNode;
  remixContent: ReactNode;
}

export function Layout({
  isPerformanceMode,
  onTogglePerformanceMode,
  isWaveformVisible,
  onToggleWaveform,
  isRemixOpen,
  onToggleRemix,
  phraseBadges,
  waveformContent,
  remixContent,
}: Readonly<LayoutProps>) {
  const [clock, setClock] = useState(() => new Date());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const masterClock = useMemo(
    () => clock.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    [clock]
  );

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-shrink-0">
      <div className="p-4 border-b border-slate-800/50 flex justify-between items-center gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-bold text-white tracking-tight">WAVEFORMS</h2>
          {phraseBadges}
        </div>

        <div className="flex items-center gap-2">
          {mounted && (
            <div className="oled-display rounded-lg border border-[#00FF00]/20 bg-black/50 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[#00FF00]">
              CLK {masterClock}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleRemix}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border',
              isRemixOpen
                ? 'bg-studio-gold/20 text-studio-gold border-studio-gold/60 shadow-[0_0_12px_rgba(255,215,0,0.22)]'
                : 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:border-white/20'
            )}
            title="Toggle Remix Drawer"
          >
            REMIX
          </button>
          <button
            type="button"
            onClick={onTogglePerformanceMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              isPerformanceMode
                ? 'bg-studio-crimson text-white shadow-[0_0_12px_rgba(255,0,60,0.4)] border border-studio-crimson'
                : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white hover:border-white/20'
            }`}
            title="Performance Mode"
          >
            <Zap className="w-3 h-3" />
            PERF
          </button>
          {!isPerformanceMode && (
            <button
              type="button"
              onClick={onToggleWaveform}
              disabled={!isWaveformVisible}
              className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white disabled:opacity-40"
              title="Collapse Waveforms"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4">
        {waveformContent}
      </div>

      <div
        className={clsx(
          'border-t border-slate-800/50 transition-all duration-300 ease-out overflow-hidden',
          isRemixOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        )}
        style={{ maxHeight: isRemixOpen ? '280px' : '0px' }}
        aria-hidden={!isRemixOpen}
      >
        <div className="p-2.5">
          {remixContent}
        </div>
      </div>
    </section>
  );
}
