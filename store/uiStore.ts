import { create } from 'zustand';

interface UIState {
  isWaveformVisible: boolean;
  isFxDockVisible: boolean;
  isLibraryVisible: boolean;
  isDeckAVisible: boolean;
  isDeckBVisible: boolean;
  isMixerVisible: boolean;
  isAddMusicModalOpen: boolean;
  accentColor: string;
  autoPlayOnHotCue: boolean;
  toggleWaveform: () => void;
  toggleFxDock: () => void;
  toggleLibrary: () => void;
  toggleDeckA: () => void;
  toggleDeckB: () => void;
  toggleMixer: () => void;
  setAddMusicModalOpen: (isOpen: boolean) => void;
  setAccentColor: (color: string) => void;
  setAutoPlayOnHotCue: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isWaveformVisible: true,
  isFxDockVisible: true,
  isLibraryVisible: true,
  isDeckAVisible: true,
  isDeckBVisible: true,
  isMixerVisible: true,
  isAddMusicModalOpen: false,
  accentColor: '#00f2ff',
  autoPlayOnHotCue: true,
  toggleWaveform: () => set((state) => ({ isWaveformVisible: !state.isWaveformVisible })),
  toggleFxDock: () => set((state) => ({ isFxDockVisible: !state.isFxDockVisible })),
  toggleLibrary: () => set((state) => ({ isLibraryVisible: !state.isLibraryVisible })),
  toggleDeckA: () => set((state) => ({ isDeckAVisible: !state.isDeckAVisible })),
  toggleDeckB: () => set((state) => ({ isDeckBVisible: !state.isDeckBVisible })),
  toggleMixer: () => set((state) => ({ isMixerVisible: !state.isMixerVisible })),
  setAddMusicModalOpen: (isOpen) => set({ isAddMusicModalOpen: isOpen }),
  setAccentColor: (color) => set({ accentColor: color }),
  setAutoPlayOnHotCue: (enabled) => set({ autoPlayOnHotCue: enabled }),
}));
