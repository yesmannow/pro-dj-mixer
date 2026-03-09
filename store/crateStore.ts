import { create } from 'zustand';
import { db, Crate, Track } from '@/lib/db';

interface CrateState {
  crates: Crate[];
  activeCrateId: number | null;
  crateTracks: Record<number, number[]>; // crateId -> trackIds
  loading: boolean;

  // Actions
  loadCrates: () => Promise<void>;
  createCrate: (name: string) => Promise<void>;
  deleteCrate: (id: number) => Promise<void>;
  addTrackToCrate: (crateId: number, trackId: number) => Promise<void>;
  removeTrackFromCrate: (crateId: number, trackId: number) => Promise<void>;
  setActiveCrate: (id: number | null) => void;
  getTracksInCrate: (crateId: number) => Promise<number[]>;
}

export const useCrateStore = create<CrateState>((set, get) => ({
  crates: [],
  activeCrateId: null,
  crateTracks: {},
  loading: false,

  loadCrates: async () => {
    set({ loading: true });
    try {
      const crates = await db.crates.orderBy('name').toArray();
      const crateTracks: Record<number, number[]> = {};
      
      for (const crate of crates) {
        if (crate.id) {
          const tracks = await db.crateTracks.where('crateId').equals(crate.id).toArray();
          crateTracks[crate.id] = tracks.map(t => t.trackId);
        }
      }

      set({ crates, crateTracks });
    } catch (error) {
      console.error('Failed to load crates:', error);
    } finally {
      set({ loading: false });
    }
  },

  createCrate: async (name: string) => {
    try {
      await db.crates.add({ name, createdAt: Date.now() });
      await get().loadCrates();
    } catch (error) {
      console.error('Failed to create crate:', error);
    }
  },

  deleteCrate: async (id: number) => {
    try {
      await db.transaction('rw', db.crates, db.crateTracks, async () => {
        await db.crates.delete(id);
        await db.crateTracks.where('crateId').equals(id).delete();
      });
      await get().loadCrates();
      if (get().activeCrateId === id) {
        set({ activeCrateId: null });
      }
    } catch (error) {
      console.error('Failed to delete crate:', error);
    }
  },

  addTrackToCrate: async (crateId: number, trackId: number) => {
    try {
      await db.crateTracks.add({
        crateId,
        trackId,
        createdAt: Date.now()
      });
      await get().loadCrates();
    } catch (error) {
      // Ignore unique constraint errors
      if (error instanceof Error && error.name === 'ConstraintError') return;
      console.error('Failed to add track to crate:', error);
    }
  },

  removeTrackFromCrate: async (crateId: number, trackId: number) => {
    try {
      await db.crateTracks
        .where('[crateId+trackId]')
        .equals([crateId, trackId])
        .delete();
      await get().loadCrates();
    } catch (error) {
      console.error('Failed to remove track from crate:', error);
    }
  },

  setActiveCrate: (id) => set({ activeCrateId: id }),

  getTracksInCrate: async (crateId: number) => {
    const tracks = await db.crateTracks.where('crateId').equals(crateId).toArray();
    return tracks.map(t => t.trackId);
  }
}));
