import { create } from 'zustand';
import { Track } from '@/lib/db';
import { AudioEngine } from '@/lib/audioEngine';

export interface StemState {
  vocals: boolean;
  drums: boolean;
  inst: boolean;
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffer: AudioBuffer | null;
  isLoading: boolean;
  volume: number;
  pitchPercent: number;
  sync: boolean;
  keyLock: boolean;
  keyLockSupported: boolean;
  stems: StemState;
}

interface DeckStore {
  deckA: DeckState;
  deckB: DeckState;
  loadTrack: (deckId: 'A' | 'B', track: Track) => Promise<void>;
  ejectTrack: (deckId: 'A' | 'B') => void;
  togglePlay: (deckId: 'A' | 'B') => void;
  setVolume: (deckId: 'A' | 'B', volume: number) => void;
  setPitch: (deckId: 'A' | 'B', pitchPercent: number) => void;
  toggleSync: (deckId: 'A' | 'B') => void;
  toggleKeyLock: (deckId: 'A' | 'B') => void;
  setCurrentTime: (deckId: 'A' | 'B', time: number) => void;
  toggleStem: (deckId: 'A' | 'B', stemType: keyof StemState) => void;
}

const initialDeckState: DeckState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  buffer: null,
  isLoading: false,
  volume: 1,
  pitchPercent: 0,
  sync: false,
  keyLock: false,
  keyLockSupported: true,
  stems: { vocals: true, drums: true, inst: true },
};

export const useDeckStore = create<DeckStore>((set, get) => ({
  deckA: { ...initialDeckState },
  deckB: { ...initialDeckState },

  loadTrack: async (deckId: 'A' | 'B', track: Track) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';

    set((state) => ({
      [deckKey]: { ...state[deckKey], isLoading: true, track, stems: { vocals: true, drums: true, inst: true } }
    }));

    try {
      const engine = AudioEngine.getInstance();
      await engine.resume();

      let buffer: AudioBuffer;
      if (track.audioUrl) {
        buffer = await engine.loadBuffer(track.audioUrl);
      } else if (track.fileBlob) {
        buffer = await engine.loadBuffer(track.fileBlob);
      } else {
        // Fallback for seeded tracks without Blob
        buffer = await engine.loadBuffer('https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg');
      }

      set((state) => ({
        [deckKey]: {
          ...state[deckKey],
          isLoading: false,
          buffer,
          duration: buffer.duration,
          currentTime: 0,
          isPlaying: false
        }
      }));
    } catch (error) {
      console.error(`Failed to load track to Deck ${deckId}:`, error);
      set((state) => ({
        [deckKey]: { ...state[deckKey], isLoading: false, track: null, buffer: null }
      }));
    }
  },

  ejectTrack: (deckId: 'A' | 'B') => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    if (typeof window !== 'undefined') {
      AudioEngine.getInstance().disconnectDeck(deckId);
    }
    set({ [deckKey]: { ...initialDeckState } });
  },

  togglePlay: (deckId: 'A' | 'B') => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    set((state) => ({
      [deckKey]: { ...state[deckKey], isPlaying: !state[deckKey].isPlaying }
    }));
  },

  setVolume: (deckId: 'A' | 'B', volume: number) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    set((state) => ({
      [deckKey]: { ...state[deckKey], volume }
    }));
  },

  setPitch: (deckId: 'A' | 'B', pitchPercent: number) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    set((state) => ({
      [deckKey]: { ...state[deckKey], pitchPercent }
    }));
  },

  setCurrentTime: (deckId: 'A' | 'B', time: number) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    set((state) => {
      if (Math.abs(state[deckKey].currentTime - time) < 0.001) {
        return state;
      }
      return {
        [deckKey]: { ...state[deckKey], currentTime: time }
      };
    });
  },

  toggleSync: (deckId: 'A' | 'B') => {
    const localDeckKey = deckId === 'A' ? 'deckA' : 'deckB';
    const masterDeckKey = deckId === 'A' ? 'deckB' : 'deckA';

    set((state) => {
      const localDeck = state[localDeckKey];
      const masterDeck = state[masterDeckKey];

      if (localDeck.sync) {
        return {
          [localDeckKey]: { ...localDeck, sync: false }
        };
      }

      const masterBpm = Number(masterDeck.track?.bpm);
      const localBpm = Number(localDeck.track?.bpm);
      const canSync =
        masterDeck.isPlaying &&
        Number.isFinite(masterBpm) &&
        Number.isFinite(localBpm) &&
        masterBpm > 0 &&
        localBpm > 0;

      if (!canSync) {
        return {
          [localDeckKey]: { ...localDeck, sync: false }
        };
      }

      const ratio = masterBpm / localBpm;
      const pitchPercent = (ratio - 1) * 100;

      return {
        [localDeckKey]: { ...localDeck, sync: true, pitchPercent }
      };
    });
  },

  toggleKeyLock: (deckId: 'A' | 'B') => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    const { enabled, supported } =
      typeof window !== 'undefined'
        ? AudioEngine.getInstance().toggleKeyLock(deckId)
        : { enabled: !get()[deckKey].keyLock, supported: true };

    set((state) => ({
      [deckKey]: {
        ...state[deckKey],
        keyLock: enabled,
        keyLockSupported: supported,
      },
    }));
  },

  toggleStem: (deckId: 'A' | 'B', stemType: keyof StemState) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    set((state) => {
      const currentStems = state[deckKey].stems;
      const nextActive = !currentStems[stemType];
      if (typeof window !== 'undefined') {
        // stems.x = true means the stem is audible (not muted); invert for setStemMute
        AudioEngine.getInstance().setStemMute(deckId, stemType, !nextActive);
      }
      return {
        [deckKey]: {
          ...state[deckKey],
          stems: { ...currentStems, [stemType]: nextActive },
        },
      };
    });
  },
}));
