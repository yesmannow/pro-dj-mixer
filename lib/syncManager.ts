import type { CuePoint, Track } from '@/lib/db';
import { buildCueCloudEntries, getCueTrackHash } from '@/store/trackCueStore';

export interface CueCloudEntry {
  slot: number;
  time: number;
  type: 'hot' | 'memory';
  timestamp: number;
  color: string;
  name: string;
}

export interface SessionDeckState {
  trackHash: string | null;
  pitchPercent: number;
  sync: boolean;
  keyLock: boolean;
  stems: {
    vocals: boolean;
    drums: boolean;
    inst: boolean;
  };
}

export interface SessionState {
  version: 'sync-ready-v1';
  updatedAt: number;
  syncTarget: {
    provider: 'supabase';
    method: 'POST';
  };
  decks: Record<'A' | 'B', SessionDeckState>;
  mixer: {
    crossfader: number;
    crossfaderCurve: 'blend' | 'cut' | 'neural';
    vaultAmbience: number;
    volumes: {
      A: number;
      B: number;
    };
  };
  trackHashes: Record<string, {
    id: string;
    trackId: number | null;
    sourceId: string | null;
    audioUrl: string | null;
    title: string;
    artist: string;
    duration: string;
  }>;
  cueCloud: Record<string, CueCloudEntry[]>;
}

const SESSION_STORAGE_KEY = 'pro-dj-mixer:session-sync:v1';
type SessionDeckInput = Omit<SessionDeckState, 'trackHash'> & { track: Track | null };

const toTrackHashEntry = (track: Track) => {
  const hash = getCueTrackHash(track);
  return {
    hash,
    entry: {
      id: hash,
      trackId: track.id ?? null,
      sourceId: track.sourceId ?? null,
      audioUrl: track.audioUrl ?? null,
      title: track.title,
      artist: track.artist,
      duration: track.duration,
    },
  };
};

export const buildSessionState = ({
  deckA,
  deckB,
  mixer,
  cuesByTrack,
}: {
  deckA: SessionDeckInput;
  deckB: SessionDeckInput;
  mixer: SessionState['mixer'];
  cuesByTrack: Record<string, CuePoint[]>;
}): SessionState => {
  const trackHashes = [deckA.track, deckB.track]
    .filter((track): track is Track => track !== null)
    .map(toTrackHashEntry)
    .reduce<SessionState['trackHashes']>((acc, item) => {
      acc[item.hash] = item.entry;
      return acc;
    }, {});

  const cueCloud = Object.entries(cuesByTrack).reduce<SessionState['cueCloud']>((acc, [trackHash, cues]) => {
    acc[trackHash] = buildCueCloudEntries(cues);
    return acc;
  }, {});

  return {
    version: 'sync-ready-v1',
    updatedAt: Date.now(),
    syncTarget: {
      provider: 'supabase',
      method: 'POST',
    },
    decks: {
      A: {
        trackHash: deckA.track ? getCueTrackHash(deckA.track) : null,
        pitchPercent: deckA.pitchPercent,
        sync: deckA.sync,
        keyLock: deckA.keyLock,
        stems: deckA.stems,
      },
      B: {
        trackHash: deckB.track ? getCueTrackHash(deckB.track) : null,
        pitchPercent: deckB.pitchPercent,
        sync: deckB.sync,
        keyLock: deckB.keyLock,
        stems: deckB.stems,
      },
    },
    mixer,
    trackHashes,
    cueCloud,
  };
};

export const saveSessionState = (sessionState: SessionState) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionState));
  } catch {
    // Ignore localStorage quota/privacy mode failures so local mixing remains responsive.
  }
};

export const loadSessionState = (): SessionState | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
};
