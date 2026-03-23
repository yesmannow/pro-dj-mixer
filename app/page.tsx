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

import { MixerScene } from '@/components/scene/MixerScene';
import { motion, AnimatePresence } from 'framer-motion';

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

  const deckA = useDeckStore(useShallow((s) => ({ isPlaying: s.deckA.isPlaying, bpm: Number(s.deckA.track?.bpm) || 0 })));
  const deckB = useDeckStore(useShallow((s) => ({ isPlaying: s.deckB.isPlaying, bpm: Number(s.deckB.track?.bpm) || 0 })));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [activeCompactPanel, setActiveCompactPanel] = useState<CompactPanel>('deckA');

  useEffect(() => {
    // Detect mobile landscape (compact) and mobile portrait requirement
    const compactQuery = window.matchMedia('(orientation: landscape) and (max-height: 600px), (max-width: 1024px) and (orientation: landscape)');
    const portraitQuery = window.matchMedia('(max-width: 768px) and (orientation: portrait)');
    
    const updateViewports = () => {
      setIsCompactViewport(compactQuery.matches);
      setIsPortraitMobile(portraitQuery.matches);
    };

    updateViewports();
    compactQuery.addEventListener('change', updateViewports);
    portraitQuery.addEventListener('change', updateViewports);
    
    return () => {
      compactQuery.removeEventListener('change', updateViewports);
      portraitQuery.removeEventListener('change', updateViewports);
    };
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
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur-md shadow-2xl overflow-hidden pointer-events-auto">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase">{title}</h2>
        {onSettings ? (
          <button
            onClick={onSettings}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {content}
      </div>
    </div>
  );

  const renderCompactPanel = () => {
    switch (resolvedCompactPanel) {
      case 'deckA': return isDeckAVisible ? renderPanelCard('Deck A', <Deck deckId="A" compact />) : null;
      case 'mixer': return isMixerVisible ? renderPanelCard('Mixer', <Mixer compact />, () => setIsSettingsOpen(true)) : null;
      case 'deckB': return isDeckBVisible ? renderPanelCard('Deck B', <Deck deckId="B" compact />) : null;
      case 'library': return isLibraryVisible ? renderPanelCard('Library', <Library compact />) : null;
      default: return null;
    }
  };

  if (isPortraitMobile) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-8 text-center z-50 fixed inset-0">
        <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-6" />
        <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-4">Rotate Device</h1>
        <p className="text-slate-400 max-w-xs mx-auto">
          PRO DJ MIXER is optimized for landscape orientation to give you the best hardware experience.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={isCompactViewport ? 'h-screen overflow-hidden flex flex-col bg-black relative' : 'min-h-screen overflow-x-hidden flex flex-col bg-black relative'}>
        <MixerScene />
        <main className="flex-1 flex flex-col relative min-h-0 pointer-events-none z-10">
          <div className="pointer-events-auto absolute top-4 right-4 z-50">
            <ViewControls compact={isCompactViewport} onOpenSettings={() => setIsSettingsOpen(true)} />
          </div>
          <div className={isCompactViewport ? 'flex-1 flex flex-col gap-3 px-3 pb-3 pt-16 overflow-hidden min-w-0' : 'flex-1 flex flex-col gap-4 p-4 pt-16 overflow-hidden min-w-0'}>
            {isCompactViewport ? (
              <>
                <div className="flex justify-center gap-2 flex-shrink-0 pointer-events-auto">
                  {compactPanels.map((panel) => (
                    <button
                      key={panel.id}
                      type="button"
                      onClick={() => setActiveCompactPanel(panel.id)}
                      className={resolvedCompactPanel === panel.id
                        ? 'rounded-full border border-blue-500/50 bg-blue-500/20 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                        : 'rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400'}
                    >
                      {panel.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  {renderCompactPanel()}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0 min-w-0 overflow-x-hidden">
                <AnimatePresence mode="popLayout">
                  {(isWaveformVisible || isPerformanceMode) && (
                    <motion.div 
                      key="waveform-panel"
                      initial={{ opacity: 0, y: -40, rotateX: -15 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      exit={{ opacity: 0, y: -40, rotateX: -15, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex-shrink-0 pointer-events-auto"
                      style={{ transformPerspective: 1200 }}
                    >
                      <div className="p-3 border-b border-white/5 flex justify-between items-center">
                        <div className="flex items-center gap-6">
                           {deckA.isPlaying && deckA.bpm > 0 && <PhraseDisplay bpm={deckA.bpm} deckId="A" label="DECK A" />}
                           <div className="w-px h-6 bg-white/10" />
                           {deckB.isPlaying && deckB.bpm > 0 && <PhraseDisplay bpm={deckB.bpm} deckId="B" label="DECK B" />}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={togglePerformanceMode}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                              isPerformanceMode
                                ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] border border-blue-500'
                                : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white hover:bg-white/10'
                            }`}
                            title="Performance Mode"
                          >
                            <Zap className="w-3 h-3" />
                            PERF
                          </button>
                          {!isPerformanceMode && (
                            <button onClick={toggleWaveform} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                              <ChevronUp className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <ParallelWaveforms />
                      </div>
                      <div className="border-t border-white/5 p-4">
                        <RemixGrid />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Central Hardware Area - 3D scene shows through. The 2D components here are fully transparent overlays for buttons/pads */}
                <div className="flex-1 w-full mx-auto flex flex-col xl:flex-row justify-center items-end gap-4 xl:gap-8 min-h-[400px]">
                  
                  {/* Left Deck 2D UI */}
                  <div className="h-full flex flex-col justify-end pb-8 order-1 md:order-1 items-center xl:w-[380px]">
                    <AnimatePresence mode="popLayout">
                      {isDeckAVisible && (
                        <motion.div
                          key="decka-overlay"
                          initial={{ opacity: 0, x: -50 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -50 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          className="w-full pointer-events-auto p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-3xl"
                        >
                          <Deck deckId="A" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Center Mixer 2D UI */}
                  <div className="h-full flex flex-col justify-end pb-8 order-3 md:order-3 xl:order-2 items-center xl:w-[340px]">
                    <AnimatePresence mode="popLayout">
                      {isMixerVisible && (
                        <motion.div
                          key="mixer-overlay"
                          initial={{ opacity: 0, y: 50 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 50 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          className="w-full pointer-events-auto p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-3xl"
                        >
                          <Mixer />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Right Deck 2D UI */}
                  <div className="h-full flex flex-col justify-end pb-8 order-2 md:order-2 xl:order-3 items-center xl:w-[380px]">
                    <AnimatePresence mode="popLayout">
                      {isDeckBVisible && (
                        <motion.div
                          key="deckb-overlay"
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 50 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          className="w-full pointer-events-auto p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-3xl"
                        >
                          <Deck deckId="B" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <AnimatePresence mode="popLayout">
                  {(isLibraryVisible || isPerformanceMode) && (
                    <motion.div
                      key="library-panel"
                      initial={{ opacity: 0, y: 60, rotateX: 20 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      exit={{ opacity: 0, y: 60, rotateX: 20, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      style={{ transformPerspective: 1500 }}
                      className="bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex-shrink-0 pointer-events-auto mb-4"
                    >
                      <div className="p-3 border-b border-white/5 flex justify-between items-center">
                        <h2 className="text-sm font-bold text-white tracking-widest uppercase">TRACK LIBRARY</h2>
                        {!isPerformanceMode && (
                          <button onClick={toggleLibrary} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="p-0">
                        <Library />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </main>
        
        <div className="pointer-events-auto z-50">
          {isAddMusicModalOpen && <AddMusicModal />}
          <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
          <AudioStats />
        </div>
      </div>
    </>
  );
}
