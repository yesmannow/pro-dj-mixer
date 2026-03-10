import { create } from 'zustand';
import { db, Track } from '@/lib/db';
import toast from 'react-hot-toast';
import type { AnalysisRequest, AnalysisResponse } from '@/lib/analysisWorker';

const R2_BASE = 'https://pub-9d6c022e6cbf422ea4fcac0a116cbfce.r2.dev/audio';
export const PIKO_VAULT_TRACKS = [
  { id: 'piko-1', title: 'Tortas De Jamon', artist: 'Piko FG', url: `${R2_BASE}/Tortas%20De%20Jamon.mp3` },
  { id: 'piko-2', title: 'Me Cuentan', artist: 'Piko FG', url: `${R2_BASE}/Me%20Cuentan.mp3` },
  { id: 'piko-3', title: 'Sin Rencores', artist: 'Piko FG', url: `${R2_BASE}/Sin%20Rencores.mp3` },
  { id: 'piko-4', title: 'Dejate Llevar', artist: 'Piko FG', url: `${R2_BASE}/Dejate%20Llevar.mp3` },
  { id: 'piko-5', title: 'Entre Humos', artist: 'Piko FG', url: `${R2_BASE}/Entre%20Humos.mp3` }
];

// Reusable decode context (main thread only). Workers cannot use Web Audio APIs.
const decodeContext =
  typeof window !== 'undefined'
    ? new (window.AudioContext || (window as any).webkitAudioContext)()
    : null;

interface LibraryState {
  tracks: Track[];
  processingTracks: { id: string; name: string }[];
  isProcessingQueue: boolean;
  queueProgress: string;
  loadTracks: () => Promise<void>;
  addTrack: (file: File) => Promise<void>;
  seedLibrary: () => Promise<void>;
  queueFilesForIngestion: (files: File[]) => Promise<void>;
  loadFromCloud: (cloudTracks: typeof PIKO_VAULT_TRACKS) => Promise<void>;
}

const mockAnalysis = async (file: File | string) => {
  // Fallback for seed tracks
  await new Promise(resolve => setTimeout(resolve, 500));
  const bpms = ['120', '124', '126', '128', '130', '140'];
  const keys = ['8A', '4A', '11B', '2A', '7B', '9A', '5B'];
  const energies = ['Low', 'Medium', 'High', 'Peak'];
  return {
    bpm: bpms[Math.floor(Math.random() * bpms.length)],
    key: keys[Math.floor(Math.random() * keys.length)],
    energy: energies[Math.floor(Math.random() * energies.length)],
    duration: '03:45',
    hasVocal: Math.random() > 0.5,
  };
};

let isSeeding = false;

const seedArtworkUrls = [
  '/track-images/abstract-1846847_1280.jpg',
  '/track-images/architecture-3189972_1280.jpg',
  '/track-images/aurora-borealis-9267515_1280.jpg',
  '/track-images/background-1833056_1280.jpg',
  '/track-images/bicycle-3045580_1280.jpg',
  '/track-images/dj-2581269_1280.jpg',
  '/track-images/gong-8255081_1280.jpg',
  '/track-images/graffiti-1476119_1280.jpg',
  '/track-images/graffiti-3750912_1280.jpg',
  '/track-images/hamburg-2718329_1280.jpg',
  '/track-images/love-2724141_1280.png',
  '/track-images/skateboard-447147_1280.jpg',
  '/track-images/skull-and-crossbones-414207_1280.jpg',
  '/track-images/starry-sky-1655503_1280.jpg',
  '/track-images/street-art-1499524_1280.jpg',
  '/track-images/tube-7260586_1280.jpg',
  '/track-images/vinyl-1595847_1280.jpg',
  '/track-images/wall-2583885_1280.jpg',
  '/track-images/wallpaper-5928106_1280.png',
  '/track-images/woman-3633737_1280.jpg'
];

const pickRandomArtworkUrl = () => {
  return seedArtworkUrls[Math.floor(Math.random() * seedArtworkUrls.length)];
};

// Singleton Worker instance
let worker: Worker | null = null;
if (typeof globalThis.window !== 'undefined') {
  worker = new Worker(new URL('../lib/analysisWorker.ts', import.meta.url), { type: 'module' });
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Helper to wrap the worker postMessage in a Promise
const analyzeAudio = (payload: { id: string; channelData: Float32Array; sampleRate: number; duration: number }): Promise<AnalysisResponse> => {
  return new Promise((resolve, reject) => {
    const runAsync = async () => {
      if (!worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const requestId = payload.id;

      const handleMessage = (e: MessageEvent<AnalysisResponse>) => {
        if (e.data.id === requestId) {
          worker?.removeEventListener('message', handleMessage);
          if (e.data.error) {
            reject(new Error(e.data.error));
            return;
          }
          resolve(e.data);
        }
      };

      worker.addEventListener('message', handleMessage);

      const request: AnalysisRequest = {
        id: requestId,
        channelData: payload.channelData,
        sampleRate: payload.sampleRate,
        duration: payload.duration,
      };

      // Attempt true zero-copy transfer; if the runtime refuses (e.g. AudioBuffer-backed data),
      // fall back to copying into a transferable ArrayBuffer to avoid crashing.
      try {
        worker.postMessage(request, [payload.channelData.buffer]);
      } catch {
        const copy = new Float32Array(payload.channelData);
        worker.postMessage({ ...request, channelData: copy }, [copy.buffer]);
      }
    };

    runAsync().catch((error) => reject(error instanceof Error ? error : new Error('Analysis failed')));
  });
};

const yieldToUi = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const fetchArrayBufferStrict = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch from cloud: ${response.status} - ${url}`);
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    throw new Error('Cloudflare returned an HTML error page. Check exact filename and path.');
  }
  return await response.arrayBuffer();
};

const decodeToMonoChannelData = async (arrayBuffer: ArrayBuffer) => {
  if (!decodeContext) throw new Error('Audio decoding is only available in the browser.');
  const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
  return {
    channelData: audioBuffer.getChannelData(0),
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
  };
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  processingTracks: [],
  isProcessingQueue: false,
  queueProgress: '',
  loadTracks: async () => {
    const tracks = await db.tracks.orderBy('createdAt').reverse().toArray();
    set({ tracks });
  },

  queueFilesForIngestion: async (files: File[]) => {
    if (get().isProcessingQueue) {
      toast.error('A queue is already processing. Please wait.');
      return;
    }

    const audioFiles = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a)$/i.test(f.name));

    if (audioFiles.length === 0) {
      toast.error("No valid audio files found in selection.");
      return;
    }

    set({ isProcessingQueue: true, queueProgress: `Preparing ${audioFiles.length} files...` });

    let successCount = 0;
    const total = audioFiles.length;

    for (let i = 0; i < total; i++) {
        const file = audioFiles[i];
        set({ queueProgress: `Analyzing ${i + 1} of ${total}: ${file.name}` });

        try {
          const arrayBuffer = await file.arrayBuffer();
          const decoded = await decodeToMonoChannelData(arrayBuffer);
          const res = await analyzeAudio({ id: crypto.randomUUID(), ...decoded });

          const artworkUrl = URL.createObjectURL(file);

          const newTrack: Track = {
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Unknown Artist',
            bpm: res.bpm.toString(),
            key: '--',
            duration: formatDuration(res.duration),
            energy: "Medium", // Algorithm pending
            hasVocal: false, // Algorithm pending
            fileBlob: file,
            artworkUrl,
            overviewWaveform: Array.from(res.overviewPeaks),
            createdAt: Date.now(),
          };

          const id = await db.tracks.add(newTrack);
          newTrack.id = id;

          set(state => ({
            tracks: [newTrack, ...state.tracks]
          }));
          successCount++;
        } catch (err) {
            console.error(`Failed to ingest ${file.name}:`, err);
        }
        await yieldToUi();
    }

    set({ isProcessingQueue: false, queueProgress: '' });
    toast.success(`Successfully imported ${successCount} tracks.`);
  },

  seedLibrary: async () => {
    if (isSeeding) return;
    isSeeding = true;

    const seedTracks = [
      { url: '/audio/12_05.mp3', name: '12_05.mp3' },
      { url: '/audio/amor-sincero.mp3', name: 'amor-sincero.mp3' },
      { url: '/audio/amores-perdidos.mp3', name: 'amores-perdidos.mp3' },
      { url: '/audio/bungalow.mp3', name: 'bungalow.mp3' },
      { url: '/audio/corazon-y-mente.mp3', name: 'corazon-y-mente.mp3' },
      { url: '/audio/crussin.mp3', name: 'crussin.mp3' },
      { url: '/audio/dejate-llevar.mp3', name: 'dejate-llevar.mp3' },
      { url: '/audio/el-don.mp3', name: 'el-don.mp3' },
      { url: '/audio/entre-humos.mp3', name: 'entre-humos.mp3' },
      { url: '/audio/f-7.mp3', name: 'f-7.mp3' },
      { url: '/audio/falle.mp3', name: 'falle.mp3' },
      { url: '/audio/ganja.mp3', name: 'ganja.mp3' },
      { url: '/audio/gunster.mp3', name: 'gunster.mp3' },
      { url: '/audio/im-sorry.mp3', name: 'im-sorry.mp3' },
      { url: '/audio/jardin-de-rosas.mp3', name: 'jardin-de-rosas.mp3' },
      { url: '/audio/los-5.mp3', name: 'los-5.mp3' },
      { url: '/audio/me-cuentan.mp3', name: 'me-cuentan.mp3' },
      { url: '/audio/noches-enteras.mp3', name: 'noches-enteras.mp3' },
      { url: '/audio/party.mp3', name: 'party.mp3' },
      { url: '/audio/quejas.mp3', name: 'quejas.mp3' },
      { url: '/audio/sentimientos.mp3', name: 'sentimientos.mp3' },
      { url: '/audio/sin-rencores.mp3', name: 'sin-rencores.mp3' },
      { url: '/audio/te-perdi.mp3', name: 'te-perdi.mp3' },
      { url: '/audio/te-prometo.mp3', name: 'te-prometo.mp3' },
      { url: '/audio/tortas-de-jamon.mp3', name: 'tortas-de-jamon.mp3' },
      { url: '/audio/un-dia-mas.mp3', name: 'un-dia-mas.mp3' }
    ];

    const existingSeededTracks = await db.tracks.where('audioUrl').anyOf(seedTracks.map(t => t.url)).toArray();
    const existingByUrl = new Map(existingSeededTracks.filter(t => t.audioUrl).map(t => [t.audioUrl as string, t]));

    // Backfill missing artwork on existing seeded tracks
    const toBackfill = existingSeededTracks.filter(t => !t.artworkUrl);
    if (toBackfill.length > 0) {
      await db.transaction('rw', db.tracks, async () => {
        for (const t of toBackfill) {
          if (!t.id) continue;
          const artworkUrl = pickRandomArtworkUrl();
          await db.tracks.update(t.id, { artworkUrl });
        }
      });
    }

    for (const track of seedTracks) {
      if (existingByUrl.has(track.url)) continue;

      const tempId = track.name + Date.now();
      set(state => ({
        processingTracks: [...state.processingTracks, { id: tempId, name: track.name }]
      }));

      try {
        const analysis = await mockAnalysis(track.name);

        let title = track.name.replace(/\.[^/.]+$/, "");
        let artist = 'Pre-existing Track';

        const newTrack: Track = {
          title,
          artist,
          bpm: analysis.bpm,
          key: analysis.key,
          duration: analysis.duration,
          energy: analysis.energy,
          hasVocal: analysis.hasVocal,
          audioUrl: track.url,
          artworkUrl: pickRandomArtworkUrl(),
          createdAt: Date.now(),
        };

        const id = await db.tracks.add(newTrack);
        newTrack.id = id;

        set(state => ({
          tracks: [...state.tracks, newTrack].sort((a, b) => b.createdAt - a.createdAt)
        }));
      } catch (error) {
        console.error(`Failed to seed ${track.name}`, error);
      } finally {
        set(state => ({
          processingTracks: state.processingTracks.filter(t => t.id !== tempId)
        }));
      }
    }
    isSeeding = false;

    // Reload to reflect any inserts/backfills
    await get().loadTracks();
  },

  loadFromCloud: async (cloudTracks) => {
    if (get().isProcessingQueue) {
      toast.error('A queue is already processing. Please wait.');
      return;
    }

    if (cloudTracks.length === 0) {
      toast.error('No cloud tracks supplied.');
      return;
    }

    set({ isProcessingQueue: true, queueProgress: `Fetching ${cloudTracks.length} cloud track(s)...` });

    let successCount = 0;

    for (let i = 0; i < cloudTracks.length; i++) {
      const track = cloudTracks[i];
      const tempId = `${track.id}-${Date.now()}`;
      set(state => ({
        processingTracks: [...state.processingTracks, { id: tempId, name: track.title }]
      }));

      try {
        set({ queueProgress: `Downloading & analyzing ${i + 1} of ${cloudTracks.length}: ${track.title}` });
        const arrayBuffer = await fetchArrayBufferStrict(track.url);
        const decoded = await decodeToMonoChannelData(arrayBuffer);
        const res = await analyzeAudio({ id: track.id, ...decoded });

        const newTrack: Track = {
          title: track.title,
          artist: track.artist || 'Unknown Artist',
          bpm: res.bpm.toString(),
          key: '--',
          duration: formatDuration(res.duration),
          energy: "Medium", // Placeholder until energy analysis exists
          hasVocal: false,  // Placeholder until vocal detection exists
          audioUrl: track.url,
          artworkUrl: pickRandomArtworkUrl(),
          overviewWaveform: Array.from(res.overviewPeaks),
          createdAt: Date.now(),
        };

        const id = await db.tracks.add(newTrack);
        newTrack.id = id;

        set(state => ({
          tracks: [newTrack, ...state.tracks],
        }));
        successCount++;
      } catch (error) {
        console.error(`Failed to ingest cloud track ${track.title}:`, error);
        toast.error(`Failed to ingest ${track.title}`);
      } finally {
        set(state => ({
          processingTracks: state.processingTracks.filter(t => t.id !== tempId)
        }));
        await yieldToUi();
      }
    }

    set({ isProcessingQueue: false, queueProgress: '' });
    if (successCount > 0) {
      toast.success(`Imported ${successCount} cloud track${successCount > 1 ? 's' : ''}.`);
    }
  },

  addTrack: async (file: File) => {
    // Legacy single-file ingest path; keep behavior consistent with the queue.
    await get().queueFilesForIngestion([file]);
  }
}));
