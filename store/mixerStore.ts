import { create } from 'zustand';

interface MixerState {
  crossfader: number; // -1 (Deck A) to 1 (Deck B), 0 is center
  volA: number; // 0 to 1
  volB: number; // 0 to 1
  eqA: { high: number; mid: number; low: number }; // -1 to 1
  eqB: { high: number; mid: number; low: number }; // -1 to 1
  crossfaderCurve: 'blend' | 'cut' | 'neural';
  vaultAmbience: number; // 0..1
  setCrossfader: (value: number) => void;
  setVolume: (deckId: 'A' | 'B', value: number) => void;
  setCrossfaderCurve: (curve: 'blend' | 'cut' | 'neural') => void;
  setEQ: (deckId: 'A' | 'B', band: 'high' | 'mid' | 'low', value: number) => void;
  setVaultAmbience: (value: number) => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  crossfader: 0,
  volA: 0.75,
  volB: 0.75,
  eqA: { high: 0, mid: 0, low: 0 },
  eqB: { high: 0, mid: 0, low: 0 },
  crossfaderCurve: 'blend',
  vaultAmbience: 0.2,
  setCrossfader: (value) => set({ crossfader: value }),
  setVolume: (deckId, value) => {
    const clamped = Math.max(0, Math.min(1, value));
    set(deckId === 'A' ? { volA: clamped } : { volB: clamped });
  },
  setCrossfaderCurve: (curve) => set({ crossfaderCurve: curve }),
  setEQ: (deckId, band, value) => set((state) => ({
    [deckId === 'A' ? 'eqA' : 'eqB']: {
      ...state[deckId === 'A' ? 'eqA' : 'eqB'],
      [band]: value
    }
  })),
  setVaultAmbience: (value) => set({ vaultAmbience: Math.max(0, Math.min(1, value)) })
}));
