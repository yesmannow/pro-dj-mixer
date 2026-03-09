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

const springTransition = { type: 'spring', damping: 25, stiffness: 200 } as const;

export default function Home() {
  const { isWaveformVisible, isFxDockVisible, isLibraryVisible } = useUIStore();

  return (
    <>
      <ViewControls />
      <main className="flex-1 flex p-4 gap-4 overflow-hidden h-full relative">
        {/* Primary UI Area */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-h-0">
          
          {/* Top Row: Parallel Waveforms Base */}
          <AnimatePresence initial={false}>
            {isWaveformVisible && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                animate={{ height: 128, opacity: 1, marginBottom: 16 }} // h-32 is 128px, mb-4 is 16px (gap is 16)
                exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                transition={springTransition}
                className="flex-shrink-0 overflow-hidden"
              >
                <ParallelWaveforms />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid for Decks & Mixer (Core Focus) */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px_1fr] gap-4 flex-1 min-h-0 items-center justify-center">
            <div className="h-full flex flex-col justify-center">
              <Deck deckId="A" />
            </div>
            <div className="hidden xl:flex h-full flex-col justify-center">
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
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 384, opacity: 1, marginTop: 16 }} // h-96 is 384px + 16px top margin
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                transition={springTransition}
                className="flex-shrink-0 overflow-hidden flex flex-col"
              >
                <Library />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Intelligence Dock (Right Sidebar) */}
        <AnimatePresence initial={false}>
          {isFxDockVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0, paddingLeft: 0, paddingRight: 0 }}
              animate={{ width: 320, opacity: 1, paddingLeft: 16, paddingRight: 16 }} // w-80 is 320px
              exit={{ width: 0, opacity: 0, paddingLeft: 0, paddingRight: 0 }}
              transition={springTransition}
              className="hidden lg:flex flex-col gap-4 py-4 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl overflow-y-auto flex-shrink-0 whitespace-nowrap"
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
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
