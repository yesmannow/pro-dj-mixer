import Dexie, { Table } from 'dexie';

export interface Track {
  id?: number;
  title: string;
  artist: string;
  bpm: string;
  key: string;
  duration: string;
  energy: string;
  hasVocal: boolean;
  fileBlob?: Blob;
  audioUrl?: string;
  artworkUrl?: string;
  overviewWaveform?: number[];
  createdAt: number;
}

export class DJDatabase extends Dexie {
  tracks!: Table<Track, number>;

  constructor() {
    super('DJDatabase');
    this.version(2).stores({
      tracks: '++id, title, artist, bpm, key, createdAt, audioUrl, artworkUrl'
    });
  }
}

export const db = new DJDatabase();
