import { create } from 'zustand';
import { db, HistoryItem, Track } from '@/lib/db';

interface HistoryState {
  history: (HistoryItem & { track?: Track })[];
  loading: boolean;

  // Actions
  loadHistory: () => Promise<void>;
  addToHistory: (trackId: number, deckId: 'A' | 'B') => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  history: [],
  loading: false,

  loadHistory: async () => {
    set({ loading: true });
    try {
      const items = await db.history.orderBy('playedAt').reverse().limit(50).toArray();
      const itemsWithTracks = await Promise.all(
        items.map(async (item) => {
          const track = await db.tracks.get(item.trackId);
          return { ...item, track };
        })
      );
      set({ history: itemsWithTracks });
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      set({ loading: false });
    }
  },

  addToHistory: async (trackId: number, deckId: 'A' | 'B') => {
    try {
      await db.history.add({
        trackId,
        deckId,
        playedAt: Date.now()
      });
      await get().loadHistory();
    } catch (error) {
      console.error('Failed to add to history:', error);
    }
  },

  clearHistory: async () => {
    try {
      await db.history.clear();
      set({ history: [] });
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }
}));
