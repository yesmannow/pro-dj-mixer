import { create } from 'zustand';
import { db, CuePoint } from '@/lib/db';
import { useDeckStore } from '@/store/deckStore';

interface TrackCueState {
  // Cache of cue points indexed by trackId
  cuesByTrack: Record<number, CuePoint[]>;
  loading: boolean;
  
  // Actions
  loadCues: (trackId: number) => Promise<void>;
  setCue: (trackId: number, slot: number, time: number, type: 'hot' | 'memory') => Promise<void>;
  clearCue: (trackId: number, slot: number) => Promise<void>;
  autoGenerateCues: (deckId: 'A' | 'B', bpm: number) => Promise<void>;
  getCues: (trackId: number) => CuePoint[];
}

export const useTrackCueStore = create<TrackCueState>((set, get) => ({
  cuesByTrack: {},
  loading: false,

  loadCues: async (trackId: number) => {
    set({ loading: true });
    try {
      const cues = await db.cuePoints.where('trackId').equals(trackId).toArray();
      set((state) => ({
        cuesByTrack: {
          ...state.cuesByTrack,
          [trackId]: cues.sort((a, b) => a.slot - b.slot)
        }
      }));
    } catch (error) {
      console.error(`Failed to load cues for track ${trackId}:`, error);
    } finally {
      set({ loading: false });
    }
  },

  setCue: async (trackId: number, slot: number, time: number, type: 'hot' | 'memory') => {
    const updatedAt = Date.now();
    const newCue: CuePoint = {
      trackId,
      slot,
      time,
      type,
      updatedAt
    };

    try {
      // Use composite index lookup to update or add
      const existing = await db.cuePoints
        .where('[trackId+slot]')
        .equals([trackId, slot])
        .first();

      if (existing?.id) {
        await db.cuePoints.update(existing.id, newCue);
      } else {
        await db.cuePoints.add(newCue);
      }

      // Refresh local cache
      await get().loadCues(trackId);
    } catch (error) {
      console.error(`Failed to set cue for track ${trackId} slot ${slot}:`, error);
    }
  },

  clearCue: async (trackId: number, slot: number) => {
    try {
      const existing = await db.cuePoints
        .where('[trackId+slot]')
        .equals([trackId, slot])
        .first();

      if (existing?.id) {
        await db.cuePoints.delete(existing.id);
        // Refresh local cache
        await get().loadCues(trackId);
      }
    } catch (error) {
      console.error(`Failed to clear cue for track ${trackId} slot ${slot}:`, error);
    }
  },

  autoGenerateCues: async (deckId: 'A' | 'B', bpm: number) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    const trackId = useDeckStore.getState()[deckKey].track?.id;
    if (!trackId) return;

    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const secondsPerBeat = 60 / safeBpm;

    const cues = get().getCues(trackId);
    const cueZero = cues.find((c) => c.slot === 0);
    const cueZeroTime = cueZero ? cueZero.time : 0;

    const tasks: Promise<any>[] = [];
    // 10 bars = 40 beats in 4/4 time.
    for (let i = 1; i <= 7; i++) {
      const time = cueZeroTime + i * 40 * secondsPerBeat;
      tasks.push(get().setCue(trackId, i, time, 'hot'));
    }

    await Promise.all(tasks);
  },

  getCues: (trackId: number) => {
    return get().cuesByTrack[trackId] || [];
  }
}));
