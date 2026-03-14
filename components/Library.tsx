'use client';

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Plus, Layers, ListChecks, UploadCloud, Loader2, FolderOpen, Trash2, Activity, Grid, List, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { PIKO_VAULT_TRACKS, useLibraryStore } from '@/store/libraryStore';
import { useUIStore } from '@/store/uiStore';
import { useDeckStore } from '@/store/deckStore';
import { useCueStore } from '@/store/cueStore';
import { useCrateStore } from '@/store/crateStore';
import { useHistoryStore } from '@/store/historyStore';
import { getCamelotStyles, isSmartMatch } from '@/lib/harmonic';
import { getCompatibleKeys } from '@/lib/harmonicKeys';
import type { Track } from '@/lib/db';
import { useShallow } from 'zustand/react/shallow';

const PendingAnalysis = () => (
  <span className="pending-analysis inline-flex items-center gap-1 text-[10px] text-studio-gold">
    <Activity className="w-3 h-3" />Pending
  </span>
);

const SPARKLINE_STORAGE_PREFIX = 'pro-dj-sparkline-v1:';
const SPARKLINE_POINT_COUNT = 56;
const SPARKLINE_ROOT_MARGIN_PX = 120;
const SPARKLINE_OFFLINE_MAX_SECONDS = 120;

// Key priority: persistent IDs first, metadata+blob fingerprint last. This stays deterministic
// for cache reuse, even though true byte-level duplicates may share the same fallback key.
const getSparklineKey = (track: Track) => {
  const fileSize = track.fileBlob?.size ?? 0;
  const lastMod = track.fileBlob instanceof File ? track.fileBlob.lastModified : 0;
  return `${track.id ?? track.sourceId ?? track.audioUrl ?? `${track.title}:${track.artist}:${fileSize}:${lastMod}`}`;
};

const buildSparkline = (samples: Float32Array, points = SPARKLINE_POINT_COUNT) => {
  if (samples.length === 0) return [];
  const bucket = Math.max(1, Math.floor(samples.length / points));
  const peaks: number[] = [];
  let maxPeak = 0;
  for (let i = 0; i < points; i += 1) {
    const start = i * bucket;
    const end = Math.min(samples.length, start + bucket);
    let peak = 0;
    for (let s = start; s < end; s += 1) {
      const value = Math.abs(samples[s]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  if (maxPeak <= 0) return peaks.map(() => 0);
  return peaks.map((peak) => Math.min(1, peak / maxPeak));
};

const SparklineCanvas = memo(function SparklineCanvas({
  track,
  fallback,
  onNeedData,
  dense,
}: Readonly<{
  track: Track;
  fallback?: number[];
  onNeedData: (track: Track) => void;
  dense: boolean;
}>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const target = wrapperRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      // Keep the observer warm by ~one sparkline-column width before rows are fully in view.
      { rootMargin: `${SPARKLINE_ROOT_MARGIN_PX}px 0px`, threshold: 0.05 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (!fallback || fallback.length === 0) {
      onNeedData(track);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = dense ? 1 : 1.2;
    ctx.strokeStyle = 'rgba(0,255,140,0.9)';
    ctx.beginPath();
    fallback.forEach((value, index) => {
      const x = (index / Math.max(1, fallback.length - 1)) * width;
      const y = height - value * (height - 2) - 1;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [dense, fallback, isVisible, onNeedData, track]);

  return (
    <div ref={wrapperRef} className="w-[120px] h-8 rounded border border-slate-800/80 bg-black/30 px-1 py-0.5">
      <canvas ref={canvasRef} width={112} height={24} className="w-full h-full" />
    </div>
  );
});

export const Library = memo(function Library({ compact = false, expanded = false }: Readonly<{ compact?: boolean; expanded?: boolean }>) {
  const [activeTab, setActiveTab] = useState<'tracks' | 'cue' | 'history'>('tracks');
  const [isDragging, setIsDragging] = useState(false);
  const [isSyncFlashing, setIsSyncFlashing] = useState(false);
  const [openActionsForTrackId, setOpenActionsForTrackId] = useState<number | null>(null);
  const [holdVaultHud, setHoldVaultHud] = useState(false);
  const [computedBpms, setComputedBpms] = useState<Record<number, string>>({});
  const [sparklineCache, setSparklineCache] = useState<Record<string, number[]>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const analyzerWorkerRef = useRef<Worker | null>(null);
  // Reuse a single AudioContext for all BPM decode operations (lightweight, non-realtime)
  const decodeAudioCtxRef = useRef<AudioContext | null>(null);
  const pendingSparklineRef = useRef(new Set<string>());

  const {
    tracks,
    processingTracks,
    fetchLibrary,
    queueFilesForIngestion,
    loadPikoVault,
    isProcessingQueue,
    queueProgress,
    isVaultSyncActive,
    vaultReadyCount,
    vaultTotalCount,
  } = useLibraryStore();
  const setAddMusicModalOpen = useUIStore(state => state.setAddMusicModalOpen);
  const { isSmartMatchEnabled, toggleSmartMatch, isGridView, toggleGridView, isPerformanceMode } = useUIStore();
  const { addToCue, queueA, queueB, removeFromCue, clearCue, popNext } = useCueStore();
  const {
    crates,
    activeCrateId,
    crateTracks,
    loadCrates,
    createCrate,
    deleteCrate,
    addTrackToCrate,
    setActiveCrate
  } = useCrateStore();
  const { history, loadHistory, addToHistory, clearHistory } = useHistoryStore();

  const deckA = useDeckStore(
    useShallow((state) => ({
      isPlaying: state.deckA.isPlaying,
      track: state.deckA.track,
    }))
  );
  const deckB = useDeckStore(
    useShallow((state) => ({
      isPlaying: state.deckB.isPlaying,
      track: state.deckB.track,
    }))
  );

  const masterDeck = deckA.isPlaying ? deckA : (deckB.isPlaying ? deckB : deckA);

  // Compute compatible keys for harmonic highlighting — only when the master deck's
  // track changes, not on every render or animation frame.
  const compatibleKeys = useMemo(
    () => masterDeck.track?.key ? getCompatibleKeys(masterDeck.track.key.toUpperCase()) : [],
    [masterDeck.track],
  );

  const isTrackHarmonicMatch = (trackKey: string | undefined) =>
    masterDeck.isPlaying && masterDeck.track?.key && trackKey
      ? compatibleKeys.includes(trackKey.toUpperCase())
      : false;

  const [newCrateName, setNewCrateName] = useState('');
  const [isCreatingCrate, setIsCreatingCrate] = useState(false);

  const displayTracks = tracks.filter(t => {
    // Crate filter
    if (activeCrateId) {
      const trackIds = crateTracks[activeCrateId] || [];
      if (!t.id || !trackIds.includes(t.id)) return false;
    }

    if (!isSmartMatchEnabled) return true;
    if (!masterDeck.track) return true; // Need a track to match against
    return isSmartMatch(
      masterDeck.track.key,
      Number(masterDeck.track.bpm) || 120,
      t.key,
      Number(t.bpm) || 120
    );
  });

  useEffect(() => {
    const loadLibrary = async () => {
      setIsLoadingLibrary(true);
      try {
        await fetchLibrary();
      } finally {
        setIsLoadingLibrary(false);
      }
    };
    void loadLibrary();
    loadCrates();
    loadHistory();
  }, [fetchLibrary, loadCrates, loadHistory]);

  // Initialise the analyzer worker (public/workers/analyzer.worker.js)
  useEffect(() => {
    analyzerWorkerRef.current = new Worker('/workers/analyzer.worker.js');
    decodeAudioCtxRef.current = new AudioContext();
    return () => {
      analyzerWorkerRef.current?.terminate();
      analyzerWorkerRef.current = null;
      void decodeAudioCtxRef.current?.close();
      decodeAudioCtxRef.current = null;
    };
  }, []);

  // For any track whose BPM is missing or '--', offload calculation to the worker
  useEffect(() => {
    const pending = tracks.find(
      (t) => t.id && (!t.bpm || t.bpm === '--') && !computedBpms[t.id] && (t.fileBlob || t.audioUrl)
    );
    if (!pending || !analyzerWorkerRef.current || !decodeAudioCtxRef.current) return;

    const worker = analyzerWorkerRef.current;
    const audioCtx = decodeAudioCtxRef.current;
    const trackId = pending.id!;

    const loadAndAnalyze = async () => {
      try {
        let arrayBuffer: ArrayBuffer;
        if (pending.fileBlob) {
          arrayBuffer = await pending.fileBlob.arrayBuffer();
        } else {
          const resp = await fetch(pending.audioUrl!);
          if (!resp.ok) return;
          arrayBuffer = await resp.arrayBuffer();
        }

        // Reuse the shared AudioContext to avoid creating heavyweight instances per track
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const audioData = audioBuffer.getChannelData(0);
        const { sampleRate } = audioBuffer;

        worker.onmessage = (e: MessageEvent<{ bpm: number; key: string }>) => {
          setComputedBpms((prev) => ({ ...prev, [trackId]: String(e.data.bpm) }));
        };

        // Transfer the backing ArrayBuffer to the worker to avoid copying the large typed array
        worker.postMessage({ audioData, sampleRate }, [audioData.buffer]);
      } catch {
        // Non-critical — silently skip tracks that cannot be decoded
      }
    };

    void loadAndAnalyze();
  }, [tracks, computedBpms]);

  // Track plays for history
  const lastPlayedIdA = useRef<number | null>(null);
  const lastPlayedIdB = useRef<number | null>(null);

  useEffect(() => {
    if (deckA.track?.id && deckA.isPlaying && deckA.track.id !== lastPlayedIdA.current) {
      addToHistory(deckA.track.id, 'A');
      lastPlayedIdA.current = deckA.track.id;
    } else if (!deckA.isPlaying) {
      lastPlayedIdA.current = null;
    }
  }, [deckA.track?.id, deckA.isPlaying, addToHistory]);

  useEffect(() => {
    if (deckB.track?.id && deckB.isPlaying && deckB.track.id !== lastPlayedIdB.current) {
      addToHistory(deckB.track.id, 'B');
      lastPlayedIdB.current = deckB.track.id;
    } else if (!deckB.isPlaying) {
      lastPlayedIdB.current = null;
    }
  }, [deckB.track?.id, deckB.isPlaying, addToHistory]);

  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (actionsMenuRef.current.contains(e.target as Node)) return;
      setOpenActionsForTrackId(null);
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenActionsForTrackId(null);
      setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (compact) return;
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      event.preventDefault();
      setIsFullscreen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compact]);

  useEffect(() => {
    const prefetched: Record<string, number[]> = {};
    tracks.forEach((track) => {
      if (Array.isArray(track.overviewWaveform) && track.overviewWaveform.length > 0) {
        prefetched[getSparklineKey(track)] = track.overviewWaveform;
      }
    });
    if (Object.keys(prefetched).length > 0) {
      setSparklineCache((prev) => ({ ...prefetched, ...prev }));
    }
  }, [tracks]);

  useEffect(() => {
    if (isVaultSyncActive || !holdVaultHud) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setHoldVaultHud(false), 700);
    return () => window.clearTimeout(timeout);
  }, [holdVaultHud, isVaultSyncActive, vaultReadyCount, vaultTotalCount]);

  useEffect(() => {
    const handleSyncFeedback = (event: Event) => {
      const syncEvent = event as CustomEvent<{ type?: 'SESSION_STATE' | 'NEW_CUE' | 'LIBRARY_REFRESH' }>;
      setIsSyncFlashing(true);
      if (syncEvent.detail?.type === 'NEW_CUE') {
        toast('B2B hot cue synced');
      }
      window.setTimeout(() => setIsSyncFlashing(false), 200);
    };

    window.addEventListener('pro-dj-sync-feedback', handleSyncFeedback as EventListener);
    return () => window.removeEventListener('pro-dj-sync-feedback', handleSyncFeedback as EventListener);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await queueFilesForIngestion(files);
  }, [queueFilesForIngestion]);

  const handleCreateCrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCrateName.trim()) return;
    await createCrate(newCrateName.trim());
    setNewCrateName('');
    setIsCreatingCrate(false);
    toast.success(`Crate "${newCrateName}" created`);
  };

  const handleTrackDragStart = (e: React.DragEvent, track: Track) => {
    e.dataTransfer.setData('application/json', JSON.stringify(track));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const vaultProgress = vaultTotalCount > 0 ? Math.min(100, (vaultReadyCount / vaultTotalCount) * 100) : 0;
  const showVaultHud = isVaultSyncActive || holdVaultHud;
  const showSidebar = !compact;

  const loadDeckFromRow = useCallback((track: Track, shiftHeld = false) => {
    const deckId = shiftHeld ? 'B' : 'A';
    void useDeckStore.getState().loadTrack(deckId, track);
    toast.success(`Loaded to Deck ${deckId}`);
  }, []);

  const ensureSparkline = useCallback(async (track: Track) => {
    const waveform = track.overviewWaveform;
    const key = getSparklineKey(track);
    if (waveform && waveform.length > 0) {
      setSparklineCache((prev) => (prev[key] ? prev : { ...prev, [key]: waveform }));
      return;
    }
    if (sparklineCache[key] || pendingSparklineRef.current.has(key)) return;
    pendingSparklineRef.current.add(key);

    try {
      const storageKey = `${SPARKLINE_STORAGE_PREFIX}${key}`;
      const cached = window.localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as number[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSparklineCache((prev) => ({ ...prev, [key]: parsed }));
          return;
        }
      }

      let arrayBuffer: ArrayBuffer | null = null;
      if (track.fileBlob) {
        arrayBuffer = await track.fileBlob.arrayBuffer();
      } else if (track.audioUrl) {
        const response = await fetch(track.audioUrl);
        if (response.ok) {
          arrayBuffer = await response.arrayBuffer();
        }
      }
      if (!arrayBuffer) return;

      const offlineContext = new OfflineAudioContext(1, 44100 * SPARKLINE_OFFLINE_MAX_SECONDS, 44100);
      const decoded = await offlineContext.decodeAudioData(arrayBuffer.slice(0));
      const peaks = buildSparkline(decoded.getChannelData(0));
      setSparklineCache((prev) => ({ ...prev, [key]: peaks }));
      window.localStorage.setItem(storageKey, JSON.stringify(peaks));
    } catch {
      // Ignore preview waveform failures; table remains interactive.
    } finally {
      pendingSparklineRef.current.delete(key);
    }
  }, [sparklineCache]);

  return (
    <div
      className={clsx(
        'library-container',
        isFullscreen && !compact && 'fixed inset-0 z-[120] rounded-none border-0',
        compact
          ? 'h-full min-h-0 w-full rounded-xl border border-white/5 flex flex-col overflow-hidden relative transition-colors duration-300 shadow-2xl'
          : isPerformanceMode
            ? 'h-[15vh] min-h-[80px] w-full rounded-xl border border-white/5 flex flex-col overflow-hidden relative transition-all duration-300 shadow-2xl'
            : expanded
              ? 'h-[60vh] min-h-[420px] w-full rounded-xl border border-white/5 flex flex-col overflow-hidden relative transition-all duration-300 shadow-2xl'
              : 'h-[40vh] min-h-[250px] w-full rounded-xl border border-white/5 flex flex-col overflow-hidden relative transition-colors duration-300 shadow-2xl',
        isSyncFlashing && 'border-[#00FF00] shadow-[0_0_0_1px_rgba(0,255,0,0.65),0_0_24px_rgba(0,255,0,0.25)]'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent/10 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-accent rounded-xl">
          <UploadCloud className="w-16 h-16 text-accent mb-4 animate-bounce" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Drop Audio Files Here</h2>
          <p className="text-slate-300 mt-2">MP3, WAV, FLAC supported</p>
        </div>
      )}

      <AnimatePresence>
        {showVaultHud && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-4 mt-4 rounded-xl border border-white/10 bg-white/10 px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#E11D48]">System Ingest</p>
                <p className="text-xs text-slate-300">Piko R2 Vault sync in progress</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black tabular-nums text-white">{vaultReadyCount}/{vaultTotalCount}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Tracks ready</p>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30 ring-1 ring-white/10">
              <motion.div
                className="h-full rounded-full bg-[#E11D48]"
                animate={{ width: `${vaultProgress}%` }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={compact ? 'p-3 border-b border-slate-800 flex flex-col gap-3 bg-slate-900/20' : 'p-4 border-b border-slate-800 flex justify-between items-center gap-3 bg-slate-900/20'}>
        <div className={compact ? 'flex flex-wrap gap-2 items-center' : 'flex flex-wrap gap-3 items-center'}>
          {/* DB Sync LED */}
          <div
            className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wider flex-shrink-0',
              isProcessingQueue
                ? 'border-amber-500/50 text-amber-400 bg-amber-900/20 db-led-loading'
                : tracks.length > 0
                ? 'border-green-500/40 text-green-400 bg-green-900/20'
                : 'border-slate-700 text-slate-600 bg-slate-900/20'
            )}
            title={isProcessingQueue ? 'Syncing to IndexedDB…' : `${tracks.length} tracks in DB`}
          >
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                isProcessingQueue ? 'bg-amber-400' : tracks.length > 0 ? 'bg-green-400' : 'bg-slate-600'
              )}
            />
            DB
          </div>
          {showSidebar ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-studio-gold">Action Center</p>
              <p className="text-[11px] text-slate-500">Tree navigation and high-density browser</p>
            </div>
          ) : (
            <>
              <button
                onClick={() => { setActiveTab('tracks'); setActiveCrate(null); }}
                className={clsx('px-3 py-1 rounded text-[11px] font-bold transition-colors', activeTab === 'tracks' && !activeCrateId ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
              >
                ALL TRACKS
              </button>

              <div className="w-px h-6 bg-slate-800 flex-shrink-0"></div>

              {crates.map(crate => (
                <div key={crate.id} className="flex items-center gap-1 group/crate flex-shrink-0">
                  <button
                    onClick={() => { setActiveTab('tracks'); setActiveCrate(crate.id!); }}
                    className={clsx(
                      'px-2.5 py-1 rounded text-[11px] font-bold transition-colors flex items-center gap-1.5',
                      activeCrateId === crate.id ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white"
                    )}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {crate.name.toUpperCase()}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (crate.id) deleteCrate(crate.id); }}
                    className="opacity-0 group-hover/crate:opacity-100 p-1 text-slate-600 hover:text-red-500 transition-all"
                    title="Delete Crate"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <button
                onClick={() => setIsCreatingCrate(true)}
                className="p-1.5 rounded bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-accent transition-colors"
                title="New Crate"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-6 bg-slate-800 flex-shrink-0 mx-2"></div>

              <button
                onClick={() => setActiveTab('cue')}
                className={clsx('px-3 py-1 rounded text-[11px] font-bold transition-colors', activeTab === 'cue' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
              >
                PREPARE
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={clsx('px-3 py-1 rounded text-[11px] font-bold transition-colors', activeTab === 'history' ? "bg-slate-800 text-accent" : "text-slate-400 hover:text-white")}
              >
                HISTORY
              </button>

              <div className="w-px h-6 bg-slate-800 mx-2 flex-shrink-0"></div>
            </>
          )}

          <button
            onClick={() => setAddMusicModalOpen(true)}
            className={compact ? 'flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-bold text-white/90 backdrop-blur-md shadow-lg transition-all' : 'flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[11px] font-bold text-white/90 backdrop-blur-md shadow-lg transition-all'}
          >
            <span className="text-accent">+</span>
            ADD MUSIC
          </button>
          <button
            onClick={toggleSmartMatch}
            className={clsx(
              compact ? 'px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all backdrop-blur-md' : "px-4 py-1.5 rounded-full border text-[11px] font-bold transition-all backdrop-blur-md",
              isSmartMatchEnabled
                ? "bg-studio-gold text-studio-black border-studio-gold shadow-[0_0_12px_#D4AF37]"
                : "bg-white/5 text-slate-200 border-white/15 hover:border-studio-gold/60 hover:text-studio-gold"
            )}
          >
            SMART MATCH
          </button>
          <button
            onClick={toggleGridView}
            className={clsx(
              compact ? 'p-1.5 rounded border text-[10px] font-bold transition-all' : "p-1.5 rounded border text-[11px] font-bold transition-all",
              isGridView
                ? "bg-studio-gold text-studio-black border-studio-gold"
                : "bg-white/5 text-slate-300 border-white/15 hover:border-studio-gold/60 hover:text-studio-gold"
            )}
            title={isGridView ? "List View" : "Grid View"}
          >
            {isGridView ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              setHoldVaultHud(true);
              void loadPikoVault(PIKO_VAULT_TRACKS);
            }}
            className={compact ? 'px-3 py-1.5 bg-studio-gold text-studio-black text-[10px] font-heading font-bold rounded hover:bg-yellow-500 transition-colors' : 'px-4 py-2 bg-studio-gold text-studio-black font-heading font-bold rounded hover:bg-yellow-500 transition-colors shrink-0'}
          >
            LOAD VAULT
          </button>
        </div>

        {isProcessingQueue && (
          <div className={compact ? 'flex items-center gap-2 text-[10px] font-mono text-slate-400' : 'flex items-center gap-2 text-[10px] font-mono text-slate-400 max-w-[40%]'}>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            <span className="truncate">{queueProgress || 'Analyzing...'}</span>
          </div>
        )}

        {isCreatingCrate && (
          <form onSubmit={handleCreateCrate} className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
            <input
              autoFocus
              type="text"
              value={newCrateName}
              onChange={(e) => setNewCrateName(e.target.value)}
              placeholder="Crate name..."
              className="bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-accent w-32"
              onBlur={() => { if (!newCrateName) setIsCreatingCrate(false); }}
            />
          </form>
        )}
      </div>
      <div className={clsx('flex-1 min-h-0', showSidebar ? 'grid grid-cols-[minmax(180px,20%)_minmax(0,1fr)]' : 'overflow-y-auto')}>
        {showSidebar && (
          <aside className="border-r border-slate-800/70 bg-black/20 p-3">
            <div className="rounded-xl border border-slate-800/80 bg-black/20 p-2">
              <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Browser Tree</div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => { setActiveTab('tracks'); setActiveCrate(null); }}
                  className={clsx(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                    activeTab === 'tracks' && !activeCrateId ? 'bg-studio-gold/15 text-studio-gold border border-studio-gold/30' : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <span>ALL TRACKS</span>
                  <span className="oled-display text-[10px] text-slate-500">{displayTracks.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('history'); setActiveCrate(null); }}
                  className={clsx(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                    activeTab === 'history' ? 'bg-studio-gold/15 text-studio-gold border border-studio-gold/30' : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <span>HISTORY</span>
                  <span className="oled-display text-[10px] text-slate-500">{history.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('cue'); setActiveCrate(null); }}
                  className={clsx(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                    activeTab === 'cue' ? 'bg-studio-gold/15 text-studio-gold border border-studio-gold/30' : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <span>PREPARE</span>
                  <span className="oled-display text-[10px] text-slate-500">{queueA.length + queueB.length}</span>
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-800/80 bg-black/20 p-2">
              <div className="mb-2 flex items-center justify-between px-2">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Crates</div>
                <button
                  type="button"
                  onClick={() => setIsCreatingCrate(true)}
                  className="rounded-md border border-slate-700 bg-slate-800/50 p-1 text-slate-400 transition-colors hover:text-accent"
                  title="New Crate"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {crates.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-slate-500">No crates yet.</div>
                ) : crates.map((crate) => (
                  <div key={crate.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('tracks'); setActiveCrate(crate.id!); }}
                      className={clsx(
                        'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors',
                        activeCrateId === crate.id ? 'bg-studio-gold/15 text-studio-gold border border-studio-gold/30' : 'text-slate-300 hover:bg-white/5'
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{crate.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (crate.id) deleteCrate(crate.id); }}
                      className="rounded-md p-1 text-slate-600 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                      title="Delete Crate"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <div className={clsx('min-h-0', showSidebar ? 'overflow-y-auto' : '')}>
        {activeTab === 'history' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold">Play History</h3>
              <button
                onClick={() => clearHistory()}
                className="px-3 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                disabled={history.length === 0}
              >
                CLEAR ALL
              </button>
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              {history.length === 0 ? (
                <div className="px-4 py-6 text-xs text-slate-500">No tracks played yet.</div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {history.map((item, idx) => (
                    <div key={`history-${item.id ?? idx}`} className="flex items-center justify-between px-4 py-3 bg-slate-900/30 group">
                      <div className="min-w-0 flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-600 w-4">{history.length - idx}</span>
                        <div className="min-w-0">
                          <div className="text-sm text-slate-200 truncate">{item.track?.title || 'Unknown Track'}</div>
                          <div className="text-[10px] text-slate-500 truncate flex items-center gap-2">
                            {item.track?.artist}
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            Deck {item.deckId}
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            {new Date(item.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { if (item.track) useDeckStore.getState().loadTrack('A', item.track); toast.success('Loaded to Deck A'); }}
                            className="px-2 py-1 text-[9px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                          >
                            DECK A
                        </button>
                        <button
                          onClick={() => { if (item.track) useDeckStore.getState().loadTrack('B', item.track); toast.success('Loaded to Deck B'); }}
                          className="px-2 py-1 text-[9px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                        >
                          DECK B
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'cue' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold">Deck A Queue</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = popNext('A');
                    if (next) useDeckStore.getState().loadTrack('A', next);
                  }}
                  className="px-3 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                  disabled={queueA.length === 0}
                >
                  LOAD NEXT
                </button>
                <button
                  onClick={() => clearCue('A')}
                  className="px-3 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                  disabled={queueA.length === 0}
                >
                  CLEAR
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              {queueA.length === 0 ? (
                <div className="px-4 py-6 text-xs text-slate-500">No tracks queued for Deck A.</div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {queueA.map((t, idx) => (
                    <div key={`cueA-${t.id ?? idx}`} className="flex items-center justify-between px-4 py-3 bg-slate-900/30">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">{t.title}</div>
                        <div className="text-[10px] text-slate-500 truncate">{t.artist}</div>
                      </div>
                      <button
                        onClick={() => { if (t.id) removeFromCue('A', t.id); }}
                        className="px-2 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                      >
                        REMOVE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-2">
              <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold">Deck B Queue</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = popNext('B');
                    if (next) useDeckStore.getState().loadTrack('B', next);
                  }}
                  className="px-3 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                  disabled={queueB.length === 0}
                >
                  LOAD NEXT
                </button>
                <button
                  onClick={() => clearCue('B')}
                  className="px-3 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                  disabled={queueB.length === 0}
                >
                  CLEAR
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              {queueB.length === 0 ? (
                <div className="px-4 py-6 text-xs text-slate-500">No tracks queued for Deck B.</div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {queueB.map((t, idx) => (
                    <div key={`cueB-${t.id ?? idx}`} className="flex items-center justify-between px-4 py-3 bg-slate-900/30">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">{t.title}</div>
                        <div className="text-[10px] text-slate-500 truncate">{t.artist}</div>
                      </div>
                      <button
                        onClick={() => { if (t.id) removeFromCue('B', t.id); }}
                        className="px-2 py-1 text-[10px] font-bold rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-accent hover:border-accent transition-colors"
                      >
                        REMOVE
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab !== 'cue' && isGridView && (
          <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {displayTracks.map((track) => {
              const camelotStyle = getCamelotStyles(track.key);
              const isHarmonicMatch = isTrackHarmonicMatch(track.key);
              return (
                <div
                  key={track.id}
                  draggable
                  onDragStart={(e) => handleTrackDragStart(e, track)}
                  onDoubleClick={(event) => loadDeckFromRow(track, event.shiftKey)}
                  className={clsx(
                    "group cursor-grab active:cursor-grabbing rounded-xl overflow-hidden border border-white/10 bg-slate-900/60 hover:bg-slate-800/60 transition-all",
                    isHarmonicMatch && "shadow-[0_0_12px_rgba(255,215,0,0.4)] border-studio-gold/50"
                  )}
                >
                  <div className="aspect-square bg-slate-800 relative overflow-hidden">
                    {track.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                        <div className="w-12 h-12 rounded-full border-2 border-slate-600 flex items-center justify-center">
                          <div className="w-3 h-3 bg-accent rounded-full" />
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                        style={{ backgroundColor: camelotStyle.bg, color: camelotStyle.text }}
                      >
                        {track.key || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[11px] font-medium text-slate-200 truncate">{track.title}</div>
                    <div className="text-[9px] text-slate-500 truncate">{track.artist}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-mono text-slate-400">{track.bpm || '--'} BPM</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {tracks.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                {isLoadingLibrary ? (
                  <>
                    <Loader2 className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-spin" />
                    <p>Loading vault...</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p>No tracks in library.</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab !== 'cue' && !isGridView && (
          <table className="w-full text-left">
            <thead className="bg-slate-900/80 sticky top-0 border-b border-slate-800 z-20">
              <tr>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  #
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Title
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Artist
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  BPM
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Key
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Duration
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold w-[120px]">
                  Spark
                </th>
                <th className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-bold text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {/* Processing Tracks */}
              {processingTracks.map((pt) => (
                <tr key={`processing-${pt.id}`} className="bg-slate-800/20">
                  <td className="px-3 py-1.5 text-sm text-slate-500"><Activity className="w-3.5 h-3.5 text-studio-gold pending-analysis" /></td>
                  <td className="px-3 py-1.5 text-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-slate-700">
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    </div>
                    <span className="font-medium text-slate-400 italic">Analyzing {pt.name}...</span>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-slate-500"><PendingAnalysis /></td>
                  <td className="px-3 py-1.5 text-sm text-slate-500"><PendingAnalysis /></td>
                  <td className="px-3 py-1.5 text-sm text-slate-500"><PendingAnalysis /></td>
                  <td className="px-3 py-1.5 text-sm text-slate-500"><PendingAnalysis /></td>
                  <td className="px-3 py-1.5 text-sm text-slate-500"><PendingAnalysis /></td>
                  <td className="px-3 py-1.5"></td>
                </tr>
              ))}

              {/* Loaded Tracks */}
              {displayTracks.map((track, index) => {
                const camelotStyle = getCamelotStyles(track.key);
                const isMatch = isSmartMatchEnabled && masterDeck.track
                  ? isSmartMatch(masterDeck.track.key, Number(masterDeck.track.bpm) || 120, track.key, Number(track.bpm) || 120)
                  : false;
                const isBlocked = isSmartMatchEnabled && masterDeck.track && !isMatch;
                const isHarmonicMatch = isTrackHarmonicMatch(track.key);
                return (
                <tr
                  key={track.id}
                  draggable
                  onDragStart={(e) => handleTrackDragStart(e, track)}
                  className={clsx(
                    "group cursor-grab active:cursor-grabbing transition-colors hover:bg-slate-800/40",
                    isMatch && "border border-studio-gold shadow-[0_0_10px_#D4AF37] animate-pulse",
                    isBlocked && "opacity-20 pointer-events-none",
                    isHarmonicMatch && !isMatch && "shadow-[0_0_8px_rgba(255,215,0,0.3)] border-l-2 border-l-studio-gold/50"
                  )}
                  onDoubleClick={(event) => loadDeckFromRow(track, event.shiftKey)}
                >
                  <td className="px-3 py-1.5 text-sm text-slate-500 font-mono">
                    {index + 1}
                  </td>
                  <td className="px-3 py-1.5 text-sm flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center border border-slate-700 overflow-hidden relative">
                      {track.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={track.artworkUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,#000_120%)] z-10"></div>
                          <div className="w-full h-full bg-slate-800 flex items-center justify-center" style={{ backgroundImage: 'repeating-radial-gradient(#1e293b 0, #1e293b 2px, #0f172a 3px, #0f172a 4px)' }}>
                            <div className="w-3 h-3 bg-accent rounded-full z-20"></div>
                          </div>
                        </>
                      )}
                    </div>
                    <span className="font-medium text-slate-200 truncate max-w-[200px]" title={track.title}>
                      {track.title}
                    </span>
                    {track.hasVocal && (
                      <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] font-bold rounded border border-blue-500/30 flex-shrink-0">
                        VOCAL
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-sm text-slate-400 truncate max-w-[150px]" title={track.artist}>{track.artist}</td>
                  <td className={clsx("px-3 py-1.5 text-sm font-mono tabular-nums font-medium", isMatch ? "text-studio-gold" : "text-slate-300")}>
                    {(track.id && computedBpms[track.id]) || track.bpm || '--'}
                  </td>
                  <td className="px-3 py-1.5 text-sm">
                    <span
                      className={clsx(
                        "px-2 py-0.5 rounded textxs font-bold font-mono tracking-tight cursor-default inline-block min-w-[32px] text-center",
                        isMatch ? "text-studio-gold border border-studio-gold/60" : ""
                      )}
                      style={{ backgroundColor: camelotStyle.bg, color: camelotStyle.text }}
                    >
                      {track.key || <PendingAnalysis />}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-sm text-slate-500 font-mono tabular-nums">{track.duration}</td>
                  <td className="px-3 py-1.5">
                    <SparklineCanvas
                      track={track}
                      fallback={sparklineCache[getSparklineKey(track)] ?? track.overviewWaveform}
                      onNeedData={ensureSparkline}
                      dense={expanded}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right relative group/menu">
                    <div ref={openActionsForTrackId === track.id ? actionsMenuRef : undefined} className="inline-block relative">
                      <button
                        type="button"
                        onClick={() => loadDeckFromRow(track)}
                        className="mr-1.5 p-1.5 rounded-lg bg-slate-800/40 border border-slate-700 text-slate-400 hover:text-[#00FF00] hover:border-[#00FF00]/70 transition-all duration-200"
                        title="Load to Deck A"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={openActionsForTrackId === track.id}
                        onClick={() => setOpenActionsForTrackId((prev) => (prev === track.id ? null : (track.id ?? null)))}
                        className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-accent hover:border-accent transition-all duration-200"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    {openActionsForTrackId === track.id && !(isSmartMatchEnabled && masterDeck.track && !isMatch) && (
                      <div className="absolute right-0 top-full mt-1 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              useDeckStore.getState().loadTrack('A', track);
                              toast.success('Added to Deck A');
                              setOpenActionsForTrackId(null);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left"
                          >
                            <Layers className="w-4 h-4" />
                            Add to Deck A
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              useDeckStore.getState().loadTrack('B', track);
                              toast.success('Added to Deck B');
                              setOpenActionsForTrackId(null);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50"
                          >
                            <Layers className="w-4 h-4 text-pink-500" />
                            Add to Deck B
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const before = queueA.length;
                              addToCue('A', track);
                              const after = useCueStore.getState().queueA.length;
                              if (after === before) toast('Already queued (Deck A)');
                              else toast.success('Added to Cue A');
                              setOpenActionsForTrackId(null);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50"
                          >
                            <ListChecks className="w-4 h-4" />
                            Add to Cue A
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const before = queueB.length;
                              addToCue('B', track);
                              const after = useCueStore.getState().queueB.length;
                              if (after === before) toast('Already queued (Deck B)');
                              else toast.success('Added to Cue B');
                              setOpenActionsForTrackId(null);
                            }}
                            className="flex items-center gap-3 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left border-t border-slate-800/50"
                          >
                            <ListChecks className="w-4 h-4 text-pink-500" />
                            Add to Cue B
                          </button>

                          {crates.length > 0 && (
                            <div className="border-t border-slate-800/50 py-1">
                              <div className="px-4 py-1 text-[9px] uppercase tracking-widest text-slate-500 font-bold">Add to Crate</div>
                              {crates.map(crate => (
                                <button
                                  key={crate.id}
                                  type="button"
                                  onClick={async () => {
                                    if (track.id && crate.id) {
                                      await addTrackToCrate(crate.id, track.id);
                                      toast.success(`Added to ${crate.name}`);
                                      setOpenActionsForTrackId(null);
                                    }
                                  }}
                                  className="flex items-center gap-3 w-full px-4 py-2 text-xs font-medium text-slate-300 hover:bg-accent/10 hover:text-accent transition-colors text-left"
                                >
                                  <FolderOpen className="w-3.5 h-3.5 opacity-50" />
                                  {crate.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {tracks.length === 0 && processingTracks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    {isLoadingLibrary ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-slate-600 animate-spin" />
                        <p>Loading vault...</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <UploadCloud className="w-8 h-8 text-slate-600" />
                        <p>No tracks in library. Drag and drop audio files here to analyze.</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
});
