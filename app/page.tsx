'use client';

import { useState } from 'react';
import { DeckFX } from '@/components/DeckFX';
import { MasterFX } from '@/components/MasterFX';
import { Deck } from '@/components/Deck';
import { Mixer } from '@/components/Mixer';
import { Library } from '@/components/Library';
import { ParallelWaveforms } from '@/components/ParallelWaveforms';
import { Sampler } from '@/components/Sampler';
import { useUIStore } from '@/store/uiStore';
import { ChevronUp, Settings } from 'lucide-react';
import { AddMusicModal } from '@/components/AddMusicModal';

import { SettingsPanel } from '@/components/SettingsPanel';

export default function Home() {
  const {
    isWaveformVisible,
    isFxDockVisible,
    isLibraryVisible,
    isDeckAVisible,
    isDeckBVisible,
    isMixerVisible,
    isAddMusicModalOpen,
    toggleWaveform,
    toggleFxDock,
    toggleLibrary,
    } = useUIStore();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col bg-studio-black">
      <main className="flex-1 flex flex-col relative min-h-0">
        {/* Primary UI Area + Intelligence Dock */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden min-w-0">
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0 min-w-0 overflow-x-hidden">
            {/* Parallel Waveforms Section */}
            {isWaveformVisible && (
              <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-shrink-0">
                <div className="p-4 border-b border-slate-800/50 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-white tracking-tight">WAVEFORMS</h2>
                  <button
                    onClick={toggleWaveform}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4">
                  <ParallelWaveforms />
                </div>
              </div>
            )}

            {/* Grid for Decks & Mixer (Core Focus) */}
            <div className="flex-1 w-full max-w-[1800px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(350px,1fr)_320px_minmax(350px,1fr)] gap-4 min-h-0">
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
              <div className="h-full flex flex-col justify-center order-3 md:order-3 xl:order-2 md:col-span-2 xl:col-span-1">
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

            {/* Library Section */}
            {isLibraryVisible && (
              <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex-shrink-0">
                <div className="p-4 border-b border-slate-800/50 flex justify-between items-center">
                  <h2 className="text-sm font-bold text-white tracking-tight">LIBRARY</h2>
                  <button
                    onClick={toggleLibrary}
                    className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-0">
                  <Library />
                </div>
              </div>
            )}
          </div>

          {/* FX Dock Section */}
          {isFxDockVisible && (
            <div className="w-full lg:w-80 flex flex-col gap-4 py-4 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl overflow-y-auto flex-shrink-0 min-w-0 overflow-x-hidden">
              <div className="px-4 pb-2 flex justify-between items-center">
                <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_5px_#00f2ff] flex-shrink-0"></div>
                  FX DOCK
                </h2>
                <button
                  onClick={toggleFxDock}
                  className="p-1.5 hover:bg-slate-800/50 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <div className="px-4">
                <MasterFX />
              </div>
              <div className="h-px w-full bg-white/5 my-2 flex-shrink-0"></div>
              <div className="px-4">
                <DeckFX side="left" />
              </div>
              <div className="px-4">
                <DeckFX side="right" />
              </div>
              <div className="px-4">
                <Sampler />
              </div>
            </div>
          )}
        </div>

      </main>
      {isAddMusicModalOpen && <AddMusicModal />}
      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
