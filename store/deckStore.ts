import { create } from 'zustand';
import { Track } from '@/lib/db';
import { AudioEngine } from '@/lib/audioEngine';

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffer: AudioBuffer | null;
  isLoading: boolean;
  volume: number;
  pitchPercent: number;
}

interface DeckStore {
  deckA: DeckState;
  deckB: DeckState;
  loadTrack: (deckId: 'A' | 'B', track: Track) => Promise<void>;
  togglePlay: (deckId: 'A' | 'B') => void;
  setVolume: (deckId: 'A' | 'B', volume: number) => void;
  setPitch: (deckId: 'A' | 'B', pitchPercent: number) => void;
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
};

export const useDeckStore = create<DeckStore>((set, get) => ({
  deckA: { ...initialDeckState },
  deckB: { ...initialDeckState },

  loadTrack: async (deckId: 'A' | 'B', track: Track) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';

    set((state) => ({
      [deckKey]: { ...state[deckKey], isLoading: true, track }
    }));

    try {
      const engine = AudioEngine.getInstance();
      await engine.resume();

      let buffer: AudioBuffer;
      if (track.fileBlob) {
        buffer = await engine.loadBuffer(track.fileBlob);
      } else if (track.audioUrl) {
        buffer = await engine.loadBuffer(track.audioUrl);
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
  }
}));
