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
  artworkUrl?: string;
  createdAt: number;
}

export class DJDatabase extends Dexie {
  tracks!: Table<Track, number>;

  constructor() {
    super('DJDatabase');
    this.version(1).stores({
      tracks: '++id, title, artist, bpm, key, createdAt'
    });
  }
}

export const db = new DJDatabase();
