import { create } from 'zustand';

interface UIState {
  isWaveformVisible: boolean;
  isFxDockVisible: boolean;
  isLibraryVisible: boolean;
  isAddMusicModalOpen: boolean;
  toggleWaveform: () => void;
  toggleFxDock: () => void;
  toggleLibrary: () => void;
  setAddMusicModalOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isWaveformVisible: true,
  isFxDockVisible: true,
  isLibraryVisible: true,
  isAddMusicModalOpen: false,
  toggleWaveform: () => set((state) => ({ isWaveformVisible: !state.isWaveformVisible })),
  toggleFxDock: () => set((state) => ({ isFxDockVisible: !state.isFxDockVisible })),
  toggleLibrary: () => set((state) => ({ isLibraryVisible: !state.isLibraryVisible })),
  setAddMusicModalOpen: (isOpen) => set({ isAddMusicModalOpen: isOpen }),
}));
