import { create } from 'zustand';
import { db, Track } from '@/lib/db';
import toast from 'react-hot-toast';
import type { AnalysisRequest, AnalysisResponse } from '@/lib/analysisWorker';

interface LibraryState {
  tracks: Track[];
  processingTracks: { id: string; name: string }[];
  isProcessingQueue: boolean;
  queueProgress: string;
  loadTracks: () => Promise<void>;
  addTrack: (file: File) => Promise<void>;
  seedLibrary: () => Promise<void>;
  queueFilesForIngestion: (files: File[]) => Promise<void>;
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

// Singleton Worker instance
let worker: Worker | null = null;
if (typeof window !== 'undefined') {
  worker = new Worker(new URL('../lib/analysisWorker.ts', import.meta.url), { type: 'module' });
}

// Helper to wrap the worker postMessage in a Promise
const analyzeAudioFile = (file: File): Promise<AnalysisResponse> => {
  return new Promise(async (resolve, reject) => {
    if (!worker) return reject("Worker not initialized");

    const arrayBuffer = await file.arrayBuffer();
    const requestId = crypto.randomUUID();

    const handleMessage = (e: MessageEvent<AnalysisResponse>) => {
      if (e.data.id === requestId) {
        worker?.removeEventListener('message', handleMessage);
        resolve(e.data);
      }
    };

    worker.addEventListener('message', handleMessage);

    const request: AnalysisRequest = {
      id: requestId,
      buffer: arrayBuffer,
      filename: file.name
    };

    worker.postMessage(request, [request.buffer]); // Transfer buffer ownership to save memory
  });
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

    set({ isProcessingQueue: true });
    
    let successCount = 0;
    const total = audioFiles.length;

    for (let i = 0; i < total; i++) {
        const file = audioFiles[i];
        set({ queueProgress: `Analyzing ${i + 1} of ${total}: ${file.name}` });
        
        try {
          // Offload to Web Worker
          const res = await analyzeAudioFile(file);

          // Convert duration to mm:ss
          const mins = Math.floor(res.duration / 60);
          const secs = Math.floor(res.duration % 60);
          const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

          const newTrack: Track = {
            title: res.title || file.name.replace(/\.[^/.]+$/, ""),
            artist: res.artist || 'Unknown Artist',
            bpm: res.bpm.toString(),
            key: res.keySignature,
            duration: formattedDuration,
            energy: "Medium", // Algorithm pending
            hasVocal: false, // Algorithm pending
            fileBlob: file,
            artworkUrl: res.albumArt,
            overviewWaveform: res.overviewWaveform,
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
    }

    set({ isProcessingQueue: false, queueProgress: '' });
    toast.success(`Successfully imported ${successCount} tracks.`);
  },

  seedLibrary: async () => {
    if (isSeeding) return;
    const count = await db.tracks.count();
    if (count > 0) return;
    
    isSeeding = true;

    const seedTracks = [
      { url: '/audio/party.mp3', name: 'party.mp3' },
      { url: '/audio/los-5.mp3', name: 'los-5.mp3' },
      { url: '/audio/te-perdi.mp3', name: 'te-perdi.mp3' }
    ];

    for (const track of seedTracks) {
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
  },

  addTrack: async (file: File) => {
    // Deprecated for the Universal Importer Queue, but leaving to prevent breaking legacy tests
    get().queueFilesForIngestion([file]);
  }
}));
