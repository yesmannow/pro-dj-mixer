'use client';

import { motion, AnimatePresence } from 'motion/react';
import { DeckFX } from '@/components/DeckFX';
import { MasterFX } from '@/components/MasterFX';
import { Deck } from '@/components/Deck';
import { Mixer } from '@/components/Mixer';
import { Library } from '@/components/Library';
import { ParallelWaveforms } from '@/components/ParallelWaveforms';
import { ViewControls } from '@/components/ViewControls';
import { useUIStore } from '@/store/uiStore';
import { ChevronUp, ChevronLeft } from 'lucide-react';

const springTransition = { type: 'spring', damping: 25, stiffness: 200 } as const;

export default function Home() {
  const { isWaveformVisible, isFxDockVisible, isLibraryVisible, toggleLibrary, toggleFxDock } = useUIStore();

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col bg-slate-950">
      <ViewControls />
      <main className="flex-1 flex flex-col relative min-h-0">
        {/* Primary UI Area + Intelligence Dock */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
            {/* Top Row: Parallel Waveforms Base */}
            <AnimatePresence initial={false}>
              {isWaveformVisible && (
                <motion.div
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={springTransition}
                  className="flex-shrink-0 overflow-hidden"
                >
                  <ParallelWaveforms />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grid for Decks & Mixer (Core Focus) */}
            <div className="flex-1 w-full max-w-[1800px] mx-auto grid grid-cols-1 xl:grid-cols-[1fr_320px_1fr] gap-4 min-h-0 items-center justify-center">
              <div className="h-full flex flex-col justify-center">
                <Deck deckId="A" />
              </div>
              <div className="h-full flex flex-col justify-center">
                <Mixer />
              </div>
              <div className="h-full flex flex-col justify-center">
                <Deck deckId="B" />
              </div>
            </div>

            {/* Library */}
            <AnimatePresence initial={false}>
              {isLibraryVisible && (
                <motion.div
                  key="library-panel"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={springTransition}
                  className="flex-shrink-0 overflow-hidden flex flex-col"
                >
                  <Library />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Intelligence Dock (Right Sidebar / Stacked on Mobile) */}
          <AnimatePresence initial={false}>
            {isFxDockVisible ? (
              <motion.div
                key="fx-dock"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={springTransition}
                className="w-full lg:w-80 flex flex-col gap-4 py-4 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl overflow-y-auto flex-shrink-0 whitespace-nowrap"
              >
                <h2 className="text-[10px] text-accent font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shadow-[0_0_5px_#00f2ff] flex-shrink-0"></div>
                  Intelligence Dock
                </h2>
                <MasterFX />
                <div className="h-px w-full bg-white/5 my-2 flex-shrink-0"></div>
                <DeckFX side="left" />
                <DeckFX side="right" />
              </motion.div>
            ) : (
              <motion.button
                key="fx-tab"
                type="button"
                onClick={toggleFxDock}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="absolute top-0 right-0 w-8 h-full bg-slate-900/80 border-l border-slate-700 cursor-pointer flex flex-col items-center justify-center gap-2 hover:bg-slate-800/90 transition-colors z-20"
                title="Show FX Dock"
              >
                <ChevronLeft className="w-4 h-4 text-slate-100" />
                <span className="text-[9px] font-semibold tracking-[0.2em] text-slate-300 rotate-90">
                  FX
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Library Edge-Snap Pull-Tab */}
        <AnimatePresence initial={false}>
          {!isLibraryVisible && (
            <motion.button
              key="library-tab"
              type="button"
              onClick={toggleLibrary}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="absolute bottom-0 left-0 right-0 h-8 bg-slate-900 border-t border-slate-700 cursor-pointer flex items-center justify-center hover:bg-slate-800 transition-colors z-20"
              title="Show Library"
            >
              <ChevronUp className="w-4 h-4 mr-2 text-slate-100" />
              <span className="text-[11px] font-semibold tracking-[0.25em] text-slate-200">
                LIBRARY
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
