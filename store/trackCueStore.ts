import { create } from 'zustand';
import { db, CuePoint, Track } from '@/lib/db';
import { useDeckStore } from '@/store/deckStore';

type CueTrackRef = number | Partial<Pick<Track, 'id' | 'sourceId' | 'audioUrl' | 'title' | 'artist' | 'duration'>>;

const normalizeCues = (cues: CuePoint[]) => cues.slice().sort((a, b) => a.slot - b.slot);

const getCueTrackHash = (track: CueTrackRef) => {
  if (typeof track === 'number') {
    return `track-id:${track}`;
  }

  const source =
    track.sourceId ||
    track.audioUrl ||
    JSON.stringify({
      title: track.title ?? 'untitled',
      artist: track.artist ?? 'unknown',
      id: track.id ?? 'pending',
    });

  return `track:${source}`;
};

const getCueStorageKey = (track: CueTrackRef) => `pro-dj-mixer:cues:${getCueTrackHash(track)}`;

const readLocalCues = (track: CueTrackRef) => {
  if (typeof window === 'undefined') return [] as CuePoint[];

  try {
    const raw = window.localStorage.getItem(getCueStorageKey(track));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CuePoint[];
    if (!Array.isArray(parsed)) return [];
    return normalizeCues(parsed.filter((cue) => typeof cue?.slot === 'number' && typeof cue?.time === 'number'));
  } catch {
    return [];
  }
};

const writeLocalCues = (track: CueTrackRef, cues: CuePoint[]) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getCueStorageKey(track), JSON.stringify(normalizeCues(cues)));
  } catch {
    // Ignore localStorage quota and privacy-mode failures; IndexedDB remains primary.
  }
};

interface TrackCueState {
  // Cache of cue points indexed by trackId
  cuesByTrack: Record<string, CuePoint[]>;
  loading: boolean;
  
  // Actions
  loadCues: (track: CueTrackRef) => Promise<void>;
  setCue: (track: CueTrackRef, slot: number, time: number, type: 'hot' | 'memory') => Promise<void>;
  clearCue: (track: CueTrackRef, slot: number) => Promise<void>;
  autoGenerateCues: (deckId: 'A' | 'B', bpm: number) => Promise<void>;
  getCues: (track: CueTrackRef) => CuePoint[];
}

export const useTrackCueStore = create<TrackCueState>((set, get) => ({
  cuesByTrack: {},
  loading: false,

  loadCues: async (track: CueTrackRef) => {
    set({ loading: true });
    const trackHash = getCueTrackHash(track);
    const trackId = typeof track === 'number' ? track : track.id;
    try {
      const indexedDbCues =
        typeof trackId === 'number'
          ? await db.cuePoints.where('trackId').equals(trackId).toArray()
          : [];
      const localCues = readLocalCues(track);
      const cues = localCues.length > 0 ? localCues : indexedDbCues;

      if (localCues.length === 0 && cues.length > 0) {
        writeLocalCues(track, cues);
      }

      if (localCues.length > 0 && indexedDbCues.length === 0 && typeof trackId === 'number') {
        await Promise.all(localCues.map(async (cue) => {
          const persistedCue = { ...cue, trackId };
          const existing = await db.cuePoints
            .where('[trackId+slot]')
            .equals([trackId, cue.slot])
            .first();

          if (existing?.id) {
            await db.cuePoints.update(existing.id, persistedCue);
          } else {
            await db.cuePoints.add(persistedCue);
          }
        }));
      }

      set((state) => ({
        cuesByTrack: {
          ...state.cuesByTrack,
          [trackHash]: normalizeCues(cues)
        }
      }));
    } catch (error) {
      console.error(`Failed to load cues for ${trackHash}:`, error);
    } finally {
      set({ loading: false });
    }
  },

  setCue: async (track: CueTrackRef, slot: number, time: number, type: 'hot' | 'memory') => {
    const trackHash = getCueTrackHash(track);
    const trackId = typeof track === 'number' ? track : track.id;
    const updatedAt = Date.now();
    const newCue: CuePoint = {
      slot,
      time,
      type,
      updatedAt
    };

    try {
      if (typeof trackId === 'number') {
        const existing = await db.cuePoints
          .where('[trackId+slot]')
          .equals([trackId, slot])
          .first();

        if (existing?.id) {
          await db.cuePoints.update(existing.id, { ...newCue, trackId });
        } else {
          await db.cuePoints.add({ ...newCue, trackId });
        }
      }

      const existingLocal = get().getCues(track);
      const nextCues = normalizeCues([
        ...existingLocal.filter((cue) => cue.slot !== slot),
        { ...newCue, ...(typeof trackId === 'number' ? { trackId } : {}) },
      ]);

      writeLocalCues(track, nextCues);
      set((state) => ({
        cuesByTrack: {
          ...state.cuesByTrack,
          [trackHash]: nextCues,
        },
      }));
    } catch (error) {
      console.error(`Failed to set cue for ${trackHash} slot ${slot}:`, error);
    }
  },

  clearCue: async (track: CueTrackRef, slot: number) => {
    const trackHash = getCueTrackHash(track);
    const trackId = typeof track === 'number' ? track : track.id;
    try {
      if (typeof trackId === 'number') {
        const existing = await db.cuePoints
          .where('[trackId+slot]')
          .equals([trackId, slot])
          .first();

        if (existing?.id) {
          await db.cuePoints.delete(existing.id);
        }
      }

      const nextCues = get().getCues(track).filter((cue) => cue.slot !== slot);
      writeLocalCues(track, nextCues);
      set((state) => ({
        cuesByTrack: {
          ...state.cuesByTrack,
          [trackHash]: nextCues,
        },
      }));
    } catch (error) {
      console.error(`Failed to clear cue for ${trackHash} slot ${slot}:`, error);
    }
  },

  autoGenerateCues: async (deckId: 'A' | 'B', bpm: number) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    const track = useDeckStore.getState()[deckKey].track;
    if (!track) return;

    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const secondsPerBeat = 60 / safeBpm;

    const cues = get().getCues(track);
    const cueZero = cues.find((c) => c.slot === 0);
    const cueZeroTime = cueZero ? cueZero.time : 0;

    const tasks: Promise<any>[] = [];
    // 10 bars = 40 beats in 4/4 time.
    for (let i = 1; i <= 7; i++) {
      const time = cueZeroTime + i * 40 * secondsPerBeat;
      tasks.push(get().setCue(track, i, time, 'hot'));
    }

    await Promise.all(tasks);
  },

  getCues: (track: CueTrackRef) => {
    return get().cuesByTrack[getCueTrackHash(track)] || readLocalCues(track);
  }
}));
