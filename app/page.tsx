'use client';

import { useEffect, useState } from 'react';
import { Deck } from '@/components/Deck';
import { AudioStats } from '@/components/AudioStats';
import { Mixer } from '@/components/Mixer';
import { ParallelWaveforms } from '@/components/ParallelWaveforms';
import { PhraseDisplay } from '@/components/PhraseDisplay';
import { RemixGrid } from '@/components/RemixGrid';
import { Layout as PerformanceLayout } from '@/components/Layout';
import { useUIStore } from '@/store/uiStore';
import { useDeckStore } from '@/store/deckStore';
import { useShallow } from 'zustand/react/shallow';
import { AddMusicModal } from '@/components/AddMusicModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ViewControls } from '@/components/ViewControls';
import { MobileNav } from '@/components/MobileNav';
import { LibraryOverlay } from '@/components/LibraryOverlay';

export default function Home() {
  useKeyboardShortcuts();

  const {
    isWaveformVisible,
    isDeckAVisible,
    isDeckBVisible,
    isMixerVisible,
    isAddMusicModalOpen,
    isPerformanceMode,
    isLibraryOverlayOpen,
    activeTab,
    setActiveTab,
    setIsLibraryOverlayOpen,
    toggleWaveform,
    togglePerformanceMode,
  } = useUIStore();

  // Omit currentTime from these selectors — PhraseDisplay subscribes to it directly,
  // isolating the 30 Hz re-renders to that small component instead of the whole page.
  const deckA = useDeckStore(useShallow((s) => ({ isPlaying: s.deckA.isPlaying, bpm: Number(s.deckA.track?.bpm) || 0 })));
  const deckB = useDeckStore(useShallow((s) => ({ isPlaying: s.deckB.isPlaying, bpm: Number(s.deckB.track?.bpm) || 0 })));

  const [isCompactViewport, setIsCompactViewport] = useState(false);
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
        <ViewControls compact={isCompactViewport} />
        <div className={
          isCompactViewport
            ? 'flex-1 flex flex-col gap-3 px-3 pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-14 overflow-hidden min-w-0'
            : 'flex-1 flex flex-col gap-4 p-4 overflow-hidden min-w-0'
        }>
          {isCompactViewport ? (
            <>
              {/* Waveforms — smooth collapse via max-h transition.
                  160px safely exceeds ParallelWaveforms compact max-height (h-24 = 96px). */}
              <div
                className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: (isWaveformVisible || isPerformanceMode) ? '160px' : '0px' }}
              >
                <ParallelWaveforms compact />
              </div>

              <div className={activeTab === 'DECK_A' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isDeckAVisible && <Deck deckId="A" compact />}
              </div>
              <div className={activeTab === 'MIXER' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isMixerVisible && <Mixer compact />}
              </div>
              <div className={activeTab === 'DECK_B' ? 'flex-1 min-h-0 overflow-hidden' : 'hidden'}>
                {isDeckBVisible && <Deck deckId="B" compact />}
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

            </div>
          )}
        </div>
      </main>
      {isCompactViewport && (
        <MobileNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenLibrary={() => setIsLibraryOverlayOpen(true)}
        />
      )}
      <LibraryOverlay
        isOpen={isLibraryOverlayOpen}
        onClose={() => setIsLibraryOverlayOpen(false)}
      />
      {isAddMusicModalOpen && <AddMusicModal />}
      <AudioStats />
    </div>
  );
}
