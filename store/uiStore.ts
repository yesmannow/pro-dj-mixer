import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────
export type CrossfaderCurve = 'blend' | 'cut' | 'neural';
export type WaveformStyle    = 'bars' | 'line' | 'mirror';
export type BpmDisplayMode   = 'integer' | 'decimal' | 'both';
export type LibraryLayout    = 'list' | 'grid' | 'compact';
export type MobileNavTab     = 'DECK_A' | 'MIXER' | 'DECK_B';

interface UIState {
  // ── Panel Visibility ───────────────────────────────────────────────────────
  isWaveformVisible:   boolean;
  isLibraryVisible:    boolean;
  isDeckAVisible:      boolean;
  isDeckBVisible:      boolean;
  isMixerVisible:      boolean;
  isAddMusicModalOpen: boolean;

  // ── Appearance ─────────────────────────────────────────────────────────────
  accentColor: string;

  // ── Library ────────────────────────────────────────────────────────────────
  isSmartMatchEnabled: boolean;
  isGridView:          boolean;
  libraryLayout:       LibraryLayout;
  isLibraryOverlayOpen: boolean;

  // ── Deck Defaults (applied on next deck load) ──────────────────────────────
  defaultVinylMode:    boolean;   // true = scratch, false = nudge
  defaultQuantize:     boolean;   // snap loops/cues to beat grid
  defaultSlipMode:     boolean;   // slip mode on by default
  pitchRange:          4 | 6 | 8 | 16 | 100;  // ±% range for pitch fader
  autoPlayOnHotCue:    boolean;

  // ── Mixer ──────────────────────────────────────────────────────────────────
  crossfaderCurve:     CrossfaderCurve;
  masterLimiter:       boolean;   // enable soft clip on master output

  // ── Waveform ───────────────────────────────────────────────────────────────
  waveformZoom:        number;    // 1–200%
  waveformStyle:       WaveformStyle;
  showWaveformBeats:   boolean;   // draw beat grid overlay

  // ── Display ────────────────────────────────────────────────────────────────
  bpmDisplayMode:      BpmDisplayMode;
  showKeyInCamelot:    boolean;   // show e.g. "8A" vs "Am"
  showEnergyBadge:     boolean;

  // ── Performance / Feature Flags ────────────────────────────────────────────
  isPerformanceMode:   boolean;   // hides library, collapses waveforms
  isShiftHeld:         boolean;
  activeTab:           MobileNavTab;

  // ── Actions ────────────────────────────────────────────────────────────────
  toggleWaveform:       () => void;
  toggleLibrary:        () => void;
  toggleDeckA:          () => void;
  toggleDeckB:          () => void;
  toggleMixer:          () => void;
  setAddMusicModalOpen: (open: boolean) => void;

  setAccentColor:       (color: string) => void;

  toggleSmartMatch:     () => void;
  toggleGridView:       () => void;
  setLibraryLayout:     (layout: LibraryLayout) => void;
  setIsLibraryOverlayOpen: (isOpen: boolean) => void;

  setDefaultVinylMode:  (v: boolean) => void;
  setDefaultQuantize:   (v: boolean) => void;
  setDefaultSlipMode:   (v: boolean) => void;
  setPitchRange:        (range: 4 | 6 | 8 | 16 | 100) => void;
  setAutoPlayOnHotCue:  (v: boolean) => void;

  setCrossfaderCurve:   (curve: CrossfaderCurve) => void;
  setMasterLimiter:     (v: boolean) => void;

  setWaveformZoom:      (zoom: number | ((prev: number) => number)) => void;
  setWaveformStyle:     (style: WaveformStyle) => void;
  setShowWaveformBeats: (v: boolean) => void;

  setBpmDisplayMode:    (mode: BpmDisplayMode) => void;
  setShowKeyInCamelot:  (v: boolean) => void;
  setShowEnergyBadge:   (v: boolean) => void;

  togglePerformanceMode: () => void;
  setShiftHeld:          (held: boolean) => void;
  setActiveTab:          (tab: MobileNavTab) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Visibility
      isWaveformVisible:   true,
      isLibraryVisible:    true,
      isDeckAVisible:      true,
      isDeckBVisible:      true,
      isMixerVisible:      true,
      isAddMusicModalOpen: false,

      // Appearance
      accentColor: '#D4AF37',

      // Library
      isSmartMatchEnabled: false,
      isGridView:          false,
      libraryLayout:       'list',
      isLibraryOverlayOpen: false,

      // Deck Defaults
      defaultVinylMode:    true,
      defaultQuantize:     true,
      defaultSlipMode:     false,
      pitchRange:          8,
      autoPlayOnHotCue:    true,

      // Mixer
      crossfaderCurve: 'blend',
      masterLimiter:   true,

      // Waveform
      waveformZoom:      80,
      waveformStyle:     'bars',
      showWaveformBeats: true,

      // Display
      bpmDisplayMode:   'decimal',
      showKeyInCamelot: true,
      showEnergyBadge:  false,

      // Performance
      isPerformanceMode: false,
      isShiftHeld:       false,
      activeTab:         'DECK_A' as MobileNavTab,

      // ── Action implementations ─────────────────────────────────────────────
      toggleWaveform:       () => set((s) => ({ isWaveformVisible: !s.isWaveformVisible })),
      toggleLibrary:        () => set((s) => ({ isLibraryVisible: !s.isLibraryVisible })),
      toggleDeckA:          () => set((s) => ({ isDeckAVisible: !s.isDeckAVisible })),
      toggleDeckB:          () => set((s) => ({ isDeckBVisible: !s.isDeckBVisible })),
      toggleMixer:          () => set((s) => ({ isMixerVisible: !s.isMixerVisible })),
      setAddMusicModalOpen: (open) => set({ isAddMusicModalOpen: open }),

      setAccentColor:      (color) => set({ accentColor: color }),

      toggleSmartMatch:    () => set((s) => ({ isSmartMatchEnabled: !s.isSmartMatchEnabled })),
      toggleGridView:      () => set((s) => ({ isGridView: !s.isGridView })),
      setLibraryLayout:    (layout) => set({ libraryLayout: layout }),
      setIsLibraryOverlayOpen: (isOpen) => set({ isLibraryOverlayOpen: isOpen }),

      setDefaultVinylMode: (v) => set({ defaultVinylMode: v }),
      setDefaultQuantize:  (v) => set({ defaultQuantize: v }),
      setDefaultSlipMode:  (v) => set({ defaultSlipMode: v }),
      setPitchRange:       (range) => set({ pitchRange: range }),
      setAutoPlayOnHotCue: (v) => set({ autoPlayOnHotCue: v }),

      setCrossfaderCurve:  (curve) => set({ crossfaderCurve: curve }),
      setMasterLimiter:    (v) => set({ masterLimiter: v }),

      setWaveformZoom:     (zoom) => set((s) => ({
        waveformZoom: typeof zoom === 'function' ? (zoom as (p: number) => number)(s.waveformZoom) : zoom,
      })),
      setWaveformStyle:    (style) => set({ waveformStyle: style }),
      setShowWaveformBeats:(v) => set({ showWaveformBeats: v }),

      setBpmDisplayMode:   (mode) => set({ bpmDisplayMode: mode }),
      setShowKeyInCamelot: (v) => set({ showKeyInCamelot: v }),
      setShowEnergyBadge:  (v) => set({ showEnergyBadge: v }),

      togglePerformanceMode: () => set((s) => ({ isPerformanceMode: !s.isPerformanceMode })),
      setShiftHeld: (held) => set((s) => (s.isShiftHeld === held ? s : { isShiftHeld: held })),
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: 'pro-dj-ui-settings', // persisted to localStorage
      partialize: (s) => ({
        // Only persist user settings, not transient UI state
        accentColor:       s.accentColor,
        libraryLayout:     s.libraryLayout,
        defaultVinylMode:  s.defaultVinylMode,
        defaultQuantize:   s.defaultQuantize,
        defaultSlipMode:   s.defaultSlipMode,
        pitchRange:        s.pitchRange,
        autoPlayOnHotCue:  s.autoPlayOnHotCue,
        crossfaderCurve:   s.crossfaderCurve,
        masterLimiter:     s.masterLimiter,
        waveformZoom:      s.waveformZoom,
        waveformStyle:     s.waveformStyle,
        showWaveformBeats: s.showWaveformBeats,
        bpmDisplayMode:    s.bpmDisplayMode,
        showKeyInCamelot:  s.showKeyInCamelot,
        showEnergyBadge:   s.showEnergyBadge,
        isSmartMatchEnabled: s.isSmartMatchEnabled,
        isGridView:        s.isGridView,
      }),
    }
  )
);
