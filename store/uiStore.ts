import { create } from 'zustand';

interface UIState {
  isWaveformVisible: boolean;
  isLibraryVisible: boolean;
  isDeckAVisible: boolean;
  isDeckBVisible: boolean;
  isMixerVisible: boolean;
  isAddMusicModalOpen: boolean;
  accentColor: string;
  autoPlayOnHotCue: boolean;
  waveformZoom: number;
  isShiftHeld: boolean;
   isSmartMatchEnabled: boolean;
  toggleWaveform: () => void;
  toggleLibrary: () => void;
  toggleDeckA: () => void;
  toggleDeckB: () => void;
  toggleMixer: () => void;
  setAddMusicModalOpen: (isOpen: boolean) => void;
  setAccentColor: (color: string) => void;
  setAutoPlayOnHotCue: (enabled: boolean) => void;
  setWaveformZoom: (zoom: number | ((prev: number) => number)) => void;
  setShiftHeld: (held: boolean) => void;
  toggleSmartMatch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isWaveformVisible: true,
  isLibraryVisible: true,
  isDeckAVisible: true,
  isDeckBVisible: true,
  isMixerVisible: true,
  isAddMusicModalOpen: false,
  accentColor: '#00f2ff',
  autoPlayOnHotCue: true,
  waveformZoom: 80,
  isShiftHeld: false,
  isSmartMatchEnabled: false,
  toggleWaveform: () => set((state) => ({ isWaveformVisible: !state.isWaveformVisible })),
  toggleLibrary: () => set((state) => ({ isLibraryVisible: !state.isLibraryVisible })),
  toggleDeckA: () => set((state) => ({ isDeckAVisible: !state.isDeckAVisible })),
  toggleDeckB: () => set((state) => ({ isDeckBVisible: !state.isDeckBVisible })),
  toggleMixer: () => set((state) => ({ isMixerVisible: !state.isMixerVisible })),
  setAddMusicModalOpen: (isOpen) => set({ isAddMusicModalOpen: isOpen }),
  setAccentColor: (color) => set({ accentColor: color }),
  setAutoPlayOnHotCue: (enabled) => set({ autoPlayOnHotCue: enabled }),
  setWaveformZoom: (zoom) => set((state) => ({
    waveformZoom: typeof zoom === 'function' ? (zoom as (prev: number) => number)(state.waveformZoom) : zoom
  })),
  setShiftHeld: (held) => set((state) => (state.isShiftHeld === held ? state : { isShiftHeld: held })),
  toggleSmartMatch: () => set((state) => ({ isSmartMatchEnabled: !state.isSmartMatchEnabled })),
}));
