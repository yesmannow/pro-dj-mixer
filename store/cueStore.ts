import { create } from 'zustand';
import { Track } from '@/lib/db';

type DeckId = 'A' | 'B';

type CueQueueItem = Track;

interface CueState {
  queueA: CueQueueItem[];
  queueB: CueQueueItem[];
  addToCue: (deckId: DeckId, track: CueQueueItem) => void;
  removeFromCue: (deckId: DeckId, trackId: number) => void;
  clearCue: (deckId: DeckId) => void;
  popNext: (deckId: DeckId) => CueQueueItem | null;
}

export const useCueStore = create<CueState>((set, get) => ({
  queueA: [],
  queueB: [],

  addToCue: (deckId, track) => {
    if (deckId === 'A') {
      set((state) => ({ queueA: [...state.queueA, track] }));
      return;
    }
    set((state) => ({ queueB: [...state.queueB, track] }));
  },

  removeFromCue: (deckId, trackId) => {
    if (deckId === 'A') {
      set((state) => ({ queueA: state.queueA.filter((t) => t.id !== trackId) }));
      return;
    }
    set((state) => ({ queueB: state.queueB.filter((t) => t.id !== trackId) }));
  },

  clearCue: (deckId) => {
    if (deckId === 'A') {
      set({ queueA: [] });
      return;
    }
    set({ queueB: [] });
  },

  popNext: (deckId) => {
    const state = get();
    if (deckId === 'A') {
      const next = state.queueA[0] ?? null;
      if (!next) return null;
      set({ queueA: state.queueA.slice(1) });
      return next;
    }

    const next = state.queueB[0] ?? null;
    if (!next) return null;
    set({ queueB: state.queueB.slice(1) });
    return next;
  }
}));
