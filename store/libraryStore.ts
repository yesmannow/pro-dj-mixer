import { create } from 'zustand';
import { db, Track } from '@/lib/db';
import toast from 'react-hot-toast';

interface LibraryState {
  tracks: Track[];
  processingTracks: { id: string; name: string }[];
  loadTracks: () => Promise<void>;
  addTrack: (file: File) => Promise<void>;
  seedLibrary: () => Promise<void>;
}

const mockAnalysis = async (file: File | string) => {
  // Simulate 1-1.5s analysis time for Essentia.js / Meyda
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));
  
  const bpms = ['120', '124', '126', '128', '130', '140'];
  const keys = ['8A', '4A', '11B', '2A', '7B', '9A', '5B'];
  const energies = ['Low', 'Medium', 'High', 'Peak'];
  
  return {
    bpm: bpms[Math.floor(Math.random() * bpms.length)],
    key: keys[Math.floor(Math.random() * keys.length)],
    energy: energies[Math.floor(Math.random() * energies.length)],
    duration: '03:45', // Mocked duration
    hasVocal: Math.random() > 0.5,
  };
};

let isSeeding = false;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  processingTracks: [],
  loadTracks: async () => {
    const tracks = await db.tracks.orderBy('createdAt').reverse().toArray();
    set({ tracks });
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
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/x-m4a', 'audio/mp4'];
    const validExtensions = /\.(mp3|wav|flac|m4a)$/i;
    
    if (!validTypes.includes(file.type) && !file.name.match(validExtensions)) {
      toast.error(`Unsupported Format: ${file.name}`);
      return;
    }

    const tempId = file.name + Date.now();
    
    set(state => ({
      processingTracks: [...state.processingTracks, { id: tempId, name: file.name }]
    }));

    try {
      // Mock Essentia.js / Meyda analysis
      const analysis = await mockAnalysis(file);
      
      // Try to extract basic info from filename
      let title = file.name.replace(/\.[^/.]+$/, "");
      let artist = 'Unknown Artist';
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts[1].trim();
      }

      const newTrack: Track = {
        title,
        artist,
        bpm: analysis.bpm,
        key: analysis.key,
        duration: analysis.duration,
        energy: analysis.energy,
        hasVocal: analysis.hasVocal,
        fileBlob: file,
        createdAt: Date.now(),
      };

      const id = await db.tracks.add(newTrack);
      newTrack.id = id;

      set(state => ({
        tracks: [newTrack, ...state.tracks]
      }));

      toast.success(`Successfully analyzed: ${title}`);
    } catch (error) {
      toast.error(`Failed to process ${file.name}`);
      console.error(error);
    } finally {
      set(state => ({
        processingTracks: state.processingTracks.filter(t => t.id !== tempId)
      }));
    }
  }
}));
