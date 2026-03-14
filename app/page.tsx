'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Deck } from '@/components/Deck';
import { AudioStats } from '@/components/AudioStats';
import { Mixer } from '@/components/Mixer';
import { Library } from '@/components/Library';
import { ParallelWaveforms } from '@/components/ParallelWaveforms';
import { PhraseDisplay } from '@/components/PhraseDisplay';
import { RemixGrid } from '@/components/RemixGrid';
import { useUIStore } from '@/store/uiStore';
import { useDeckStore } from '@/store/deckStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronUp, Settings, Zap } from 'lucide-react';
import { AddMusicModal } from '@/components/AddMusicModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

import { SettingsPanel } from '@/components/SettingsPanel';
import { ViewControls } from '@/components/ViewControls';
import { CRTTerminal } from '@/components/ui/CRTTerminal';

type CompactPanel = 'deckA' | 'mixer' | 'deckB' | 'library';

export default function Home() {
  useKeyboardShortcuts();

  const {
    isWaveformVisible,
    isLibraryVisible,
    isDeckAVisible,
    isDeckBVisible,
    isMixerVisible,
    isAddMusicModalOpen,
    isPerformanceMode,
    toggleWaveform,
    toggleLibrary,
    togglePerformanceMode,
  } = useUIStore();

  // Omit currentTime from these selectors — PhraseDisplay subscribes to it directly,
  // isolating the 30 Hz re-renders to that small component instead of the whole page.
  const deckA = useDeckStore(useShallow((s) => ({ isPlaying: s.deckA.isPlaying, bpm: Number(s.deckA.track?.bpm) || 0 })));
  const deckB = useDeckStore(useShallow((s) => ({ isPlaying: s.deckB.isPlaying, bpm: Number(s.deckB.track?.bpm) || 0 })));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [activeCompactPanel, setActiveCompactPanel] = useState<CompactPanel>('deckA');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: landscape) and (max-height: 540px), (max-width: 767px)');
    const updateCompactViewport = () => setIsCompactViewport(mediaQuery.matches);

    updateCompactViewport();
    mediaQuery.addEventListener('change', updateCompactViewport);
    return () => mediaQuery.removeEventListener('change', updateCompactViewport);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js');
  }, []);

  const compactPanels = useMemo(() => {
    const panels: Array<{ id: CompactPanel; label: string; visible: boolean }> = [
      { id: 'deckA', label: 'Deck A', visible: isDeckAVisible },
      { id: 'mixer', label: 'Mixer', visible: isMixerVisible },
      { id: 'deckB', label: 'Deck B', visible: isDeckBVisible },
      { id: 'library', label: 'Library', visible: isLibraryVisible },
    ];

    return panels.filter((panel) => panel.visible);
  }, [isDeckAVisible, isMixerVisible, isDeckBVisible, isLibraryVisible]);

  const resolvedCompactPanel = compactPanels.some((panel) => panel.id === activeCompactPanel)
    ? activeCompactPanel
    : (compactPanels[0]?.id ?? 'deckA');

  const renderPanelCard = (title: string, content: ReactNode, onSettings?: () => void) => (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-studio-gold/20 bg-studio-slate/90 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-studio-gold/20 px-3 py-2.5">
        <h2 className="text-xs font-bold tracking-[0.24em] text-white uppercase">{title}</h2>
        {onSettings ? (
          <button
            onClick={onSettings}
            className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {content}
      </div>
    </div>
  );

  const renderCompactPanel = () => {
    switch (resolvedCompactPanel) {
      case 'deckA':
        return isDeckAVisible ? renderPanelCard('Deck A', <Deck deckId="A" compact />, undefined) : null;
      case 'mixer':
        return isMixerVisible ? renderPanelCard('Mixer', <Mixer compact />, () => setIsSettingsOpen(true)) : null;
      case 'deckB':
        return isDeckBVisible ? renderPanelCard('Deck B', <Deck deckId="B" compact />, undefined) : null;
      case 'library':
        return isLibraryVisible ? renderPanelCard('Library', <Library compact />, undefined) : null;
      default:
        return null;
    }
  };

  return (
    <CRTTerminal>
      <div className={isCompactViewport ? 'h-screen overflow-hidden flex flex-col bg-studio-black relative' : 'min-h-screen overflow-x-hidden flex flex-col bg-studio-black relative'}>
        <main className="flex-1 flex flex-col relative min-h-0">
          <ViewControls compact={isCompactViewport} onOpenSettings={() => setIsSettingsOpen(true)} />
          <div className={isCompactViewport ? 'flex-1 flex flex-col gap-3 px-3 pb-3 pt-14 overflow-hidden min-w-0' : 'flex-1 flex flex-col gap-4 p-4 overflow-hidden min-w-0'}>
            {isCompactViewport ? (
              <>
                <div className="grid grid-cols-4 gap-2 flex-shrink-0">
                  {compactPanels.map((panel) => (
                    <button
                      key={panel.id}
                      type="button"
                      onClick={() => setActiveCompactPanel(panel.id)}
                      className={resolvedCompactPanel === panel.id
                        ? 'rounded-xl border border-studio-gold bg-studio-gold/15 px-2 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-studio-gold shadow-[0_0_14px_rgba(212,175,55,0.18)]'
                        : 'rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300'}
                    >
                      {panel.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1">
                  {renderCompactPanel()}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0 min-w-0 overflow-x-hidden">
                {(isWaveformVisible || isPerformanceMode) && (
                  <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-shrink-0">
                    <div className="p-4 border-b border-slate-800/50 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <h2 className="text-sm font-bold text-white tracking-tight">WAVEFORMS</h2>
                        {deckA.isPlaying && deckA.bpm > 0 && (
                          <PhraseDisplay bpm={deckA.bpm} deckId="A" label="A" />
                        )}
                        {deckB.isPlaying && deckB.bpm > 0 && (
                          <PhraseDisplay bpm={deckB.bpm} deckId="B" label="B" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={togglePerformanceMode}
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
                            onClick={toggleWaveform}
                            className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <ParallelWaveforms />
                    </div>
                    <div className="border-t border-slate-800/50 p-4">
                      <RemixGrid />
                    </div>
                  </div>
                )}

                <div className="flex-1 w-full max-w-[1920px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(420px,1fr)_minmax(360px,0.9fr)_minmax(420px,1fr)] gap-6 min-h-0">
                  <div className="h-full flex flex-col justify-center order-1 md:order-1">
                    {isDeckAVisible && (
                      <div className="bg-studio-slate/90 backdrop-blur-xl rounded-2xl border border-studio-gold/20 shadow-2xl overflow-visible">
                        <div className="p-4 border-b border-studio-gold/20 flex items-center">
                          <h2 className="text-sm font-bold text-white tracking-tight">DECK A</h2>
                        </div>
                        <div className="p-4">
                          <Deck deckId="A" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="h-full flex flex-col justify-center order-3 md:order-3 xl:order-2">
                    {isMixerVisible && (
                      <div className="bg-studio-slate/90 backdrop-blur-xl rounded-2xl border border-studio-gold/20 shadow-2xl overflow-visible">
                        <div className="p-4 border-b border-studio-gold/20 flex justify-between items-center">
                          <h2 className="text-sm font-bold text-white tracking-tight">MIXER</h2>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setIsSettingsOpen(true)}
                              className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                              title="Settings"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="p-4">
                          <Mixer />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="h-full flex flex-col justify-center order-2 md:order-2 xl:order-3">
                    {isDeckBVisible && (
                      <div className="bg-studio-slate/90 backdrop-blur-xl rounded-2xl border border-studio-gold/20 shadow-2xl overflow-visible">
                        <div className="p-4 border-b border-studio-gold/20 flex items-center">
                          <h2 className="text-sm font-bold text-white tracking-tight">DECK B</h2>
                        </div>
                        <div className="p-4">
                          <Deck deckId="B" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {(isLibraryVisible || isPerformanceMode) && (
                  <div className={`bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-shrink-0 transition-all duration-300`}>
                    <div className="p-4 border-b border-slate-800/50 flex justify-between items-center">
                      <h2 className="text-sm font-bold text-white tracking-tight">LIBRARY</h2>
                      {!isPerformanceMode && (
                        <button
                          onClick={toggleLibrary}
                          className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="p-0">
                      <Library />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
        {isAddMusicModalOpen && <AddMusicModal />}
        <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <AudioStats />
      </div>
    </CRTTerminal>
  );
}
