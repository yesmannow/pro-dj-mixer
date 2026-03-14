'use client';

import { useEffect, useState } from 'react';
import { Deck } from '@/components/Deck';
import { AudioStats } from '@/components/AudioStats';
import { Mixer } from '@/components/Mixer';
import { Library } from '@/components/Library';
import { ParallelWaveforms } from '@/components/ParallelWaveforms';
import { PhraseDisplay } from '@/components/PhraseDisplay';
import { RemixGrid } from '@/components/RemixGrid';
import { Layout as PerformanceLayout } from '@/components/Layout';
import { useUIStore } from '@/store/uiStore';
import { useDeckStore } from '@/store/deckStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronUp, Settings } from 'lucide-react';
import { AddMusicModal } from '@/components/AddMusicModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ViewControls } from '@/components/ViewControls';
import { MobileNav, type MobileNavTab } from '@/components/MobileNav';

const EXPANDED_LIBRARY_VERTICAL_OFFSET_PX = 420;

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
  const [activeTab, setActiveTab] = useState<MobileNavTab>('DECK_A');
  const [isRemixDrawerOpen, setIsRemixDrawerOpen] = useState(false);

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

  return (
    <div
      className="h-screen overflow-hidden flex flex-col bg-studio-black relative"
      style={{ touchAction: 'none' }}
    >
      <main className="flex-1 flex flex-col relative min-h-0">
        <ViewControls compact={isCompactViewport} onOpenSettings={() => setIsSettingsOpen(true)} />
        <div className={
          isCompactViewport
            ? 'flex-1 flex flex-col gap-3 px-3 pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-14 overflow-hidden min-w-0'
            : 'flex-1 flex flex-col gap-4 p-4 overflow-hidden min-w-0'
        }>
          {isCompactViewport ? (
            <>
              {/* Waveforms fixed at top in stacked mode */}
              {(isWaveformVisible || isPerformanceMode) && (
                <div className="flex-shrink-0">
                  <ParallelWaveforms compact />
                </div>
              )}

              <div className={activeTab === 'DECK_A' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isDeckAVisible && <Deck deckId="A" compact />}
              </div>
              <div className={activeTab === 'MIXER' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isMixerVisible && <Mixer compact />}
              </div>
              <div className={activeTab === 'DECK_B' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isDeckBVisible && <Deck deckId="B" compact />}
              </div>
              <div
                className={activeTab === 'LIBRARY' ? 'flex-1 min-h-0 overflow-y-auto' : 'hidden'}
                style={{ touchAction: 'pan-y' }}
              >
                {isLibraryVisible && <Library compact />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0 min-w-0 overflow-x-hidden">
              {(isWaveformVisible || isPerformanceMode) && (
                <PerformanceLayout
                  isPerformanceMode={isPerformanceMode}
                  onTogglePerformanceMode={togglePerformanceMode}
                  isWaveformVisible={isWaveformVisible}
                  onToggleWaveform={toggleWaveform}
                  isRemixOpen={isRemixDrawerOpen}
                  onToggleRemix={() => setIsRemixDrawerOpen((prev) => !prev)}
                  phraseBadges={(
                    <>
                      {deckA.isPlaying && deckA.bpm > 0 && (
                        <PhraseDisplay bpm={deckA.bpm} deckId="A" label="A" />
                      )}
                      {deckB.isPlaying && deckB.bpm > 0 && (
                        <PhraseDisplay bpm={deckB.bpm} deckId="B" label="B" />
                      )}
                    </>
                  )}
                  waveformContent={<ParallelWaveforms />}
                  remixContent={<RemixGrid />}
                />
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
                <div
                  className={`bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden transition-all duration-300 ${!isRemixDrawerOpen ? 'flex-1 min-h-[48vh]' : 'flex-shrink-0'}`}
                  style={!isRemixDrawerOpen ? { minHeight: `calc(100vh - ${EXPANDED_LIBRARY_VERTICAL_OFFSET_PX}px)` } : undefined}
                >
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
                    <Library expanded={!isRemixDrawerOpen} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      {isCompactViewport && <MobileNav activeTab={activeTab} onTabChange={setActiveTab} />}
      {isAddMusicModalOpen && <AddMusicModal />}
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AudioStats />
    </div>
  );
}
