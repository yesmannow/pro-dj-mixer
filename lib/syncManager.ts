import type { CuePoint, Track } from '@/lib/db';
import { AudioEngine } from '@/lib/audioEngine';
import { useDeckStore } from '@/store/deckStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useMixerStore } from '@/store/mixerStore';
import { buildCueCloudEntries, getCueTrackHash } from '@/store/trackCueStore';
import { useTrackCueStore } from '@/store/trackCueStore';

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
    provider: 'broadcast-channel';
    method: 'BroadcastChannel.postMessage';
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

const LOCAL_SESSION_PERSISTENCE_KEY = 'pro-dj-mixer:session-sync:v1';
const SYNC_CHANNEL_NAME = 'pro_dj_studio_sync';
const createSyncClientId = () => {
  const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }

  if (webCrypto?.getRandomValues) {
    const values = webCrypto.getRandomValues(new Uint32Array(4));
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('-');
  }

  return `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const syncClientId = createSyncClientId();

type SessionDeckInput = Omit<SessionDeckState, 'trackHash'> & { track: Track | null };
type CueSyncPayload = CueCloudEntry & { deleted?: boolean };
type SyncMessage =
  | { type: 'SESSION_STATE'; senderId: string; sessionState: SessionState }
  | { type: 'NEW_CUE'; senderId: string; trackHash: string; cueData: CueSyncPayload }
  | { type: 'LIBRARY_REFRESH'; senderId: string };

let syncChannel: BroadcastChannel | null = null;
let syncListenerAttached = false;
let lastRemoteSessionSignature = '';
let lastBroadcastSessionSignature = '';

const isCueSyncPayload = (value: unknown): value is CueSyncPayload => {
  if (!value || typeof value !== 'object') return false;
  const cue = value as Partial<CueSyncPayload>;
  return (
    typeof cue.slot === 'number' &&
    typeof cue.time === 'number' &&
    (cue.type === 'hot' || cue.type === 'memory') &&
    typeof cue.timestamp === 'number' &&
    typeof cue.color === 'string' &&
    typeof cue.name === 'string'
  );
};

const isSessionState = (value: unknown): value is SessionState => {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<SessionState>;
  return (
    session.version === 'sync-ready-v1' &&
    typeof session.updatedAt === 'number' &&
    !!session.decks &&
    !!session.mixer &&
    !!session.trackHashes &&
    !!session.cueCloud
  );
};

const isSyncMessage = (value: unknown): value is SyncMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<SyncMessage>;
  if (typeof message.senderId !== 'string') return false;
  if (message.type === 'LIBRARY_REFRESH') return true;
  if (message.type === 'SESSION_STATE') return isSessionState(message.sessionState);
  if (message.type === 'NEW_CUE') {
    return typeof message.trackHash === 'string' && isCueSyncPayload(message.cueData);
  }
  return false;
};

const getSyncChannel = () => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!syncChannel) {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
  }

  return syncChannel;
};

const cueEntryToCuePoint = (cue: CueSyncPayload): CuePoint => ({
  slot: cue.slot,
  time: cue.time,
  type: cue.type,
  updatedAt: cue.timestamp,
  ...(cue.color ? { color: cue.color } : {}),
  ...(cue.name ? { label: cue.name } : {}),
});

const applyRemoteCue = (trackHash: string, cueData: CueSyncPayload) => {
  useTrackCueStore.setState((state) => {
    const existingCues = state.cuesByTrack[trackHash] ?? [];
    const cuesWithoutSlot = existingCues.filter((cue) => cue.slot !== cueData.slot);
    const nextCues = cueData.deleted
      ? cuesWithoutSlot
      : [...cuesWithoutSlot, cueEntryToCuePoint(cueData)]
          .sort((a, b) => a.slot - b.slot);

    return {
      cuesByTrack: {
        ...state.cuesByTrack,
        [trackHash]: nextCues,
      },
    };
  });
};

const applyRemoteSessionState = async (sessionState: SessionState) => {
  useMixerStore.setState({
    crossfader: sessionState.mixer.crossfader,
    crossfaderCurve: sessionState.mixer.crossfaderCurve,
    vaultAmbience: sessionState.mixer.vaultAmbience,
    volA: sessionState.mixer.volumes.A,
    volB: sessionState.mixer.volumes.B,
  });

  const deckStore = useDeckStore.getState();
  (['A', 'B'] as const).forEach((deckId) => {
    const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
    const nextDeck = sessionState.decks[deckId];
    const currentDeck = deckStore[deckKey];

    useDeckStore.setState((state) => ({
      [deckKey]: {
        ...state[deckKey],
        pitchPercent: nextDeck.pitchPercent,
        sync: nextDeck.sync,
        keyLock: nextDeck.keyLock,
        stems: nextDeck.stems,
      },
    }));

    if (currentDeck.keyLock !== nextDeck.keyLock && typeof window !== 'undefined') {
      AudioEngine.getInstance().toggleKeyLock(deckId);
    }
  });

  Object.entries(sessionState.cueCloud).forEach(([trackHash, cues]) => {
    cues.forEach((cue) => applyRemoteCue(trackHash, cue));
  });

  const libraryStore = useLibraryStore.getState();
  if (libraryStore.tracks.length === 0) {
    await libraryStore.loadTracks();
  }

  const tracks = useLibraryStore.getState().tracks;
  await Promise.all((['A', 'B'] as const).map(async (deckId) => {
    const trackHash = sessionState.decks[deckId].trackHash;
    if (!trackHash) return;

    const currentTrack = useDeckStore.getState()[deckId === 'A' ? 'deckA' : 'deckB'].track;
    if (currentTrack && getCueTrackHash(currentTrack) === trackHash) return;

    const sessionTrack = sessionState.trackHashes[trackHash];
    const matchedTrack = tracks.find((track) => {
      if (getCueTrackHash(track) === trackHash) return true;
      if (!sessionTrack) return false;
      return (
        (sessionTrack.trackId !== null && track.id === sessionTrack.trackId) ||
        (!!sessionTrack.sourceId && track.sourceId === sessionTrack.sourceId) ||
        (!!sessionTrack.audioUrl && track.audioUrl === sessionTrack.audioUrl)
      );
    });

    if (matchedTrack) {
      await useDeckStore.getState().loadTrack(deckId, matchedTrack);
    }
  }));

  saveSessionState(sessionState, { broadcast: false });
};

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
      provider: 'broadcast-channel',
      method: 'BroadcastChannel.postMessage',
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

const emitSyncFeedback = (messageType: SyncMessage['type']) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pro-dj-sync-feedback', { detail: { type: messageType } }));
};

export const ensureSessionSync = () => {
  const channel = getSyncChannel();
  if (!channel || syncListenerAttached) return;

  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    const message = event.data;
    if (!isSyncMessage(message)) return;
    if (!message || message.senderId === syncClientId) return;

    emitSyncFeedback(message.type);

    if (message.type === 'NEW_CUE') {
      applyRemoteCue(message.trackHash, message.cueData);
      return;
    }

    if (message.type === 'LIBRARY_REFRESH') {
      void useLibraryStore.getState().loadTracks();
      return;
    }

    const signature = JSON.stringify(message.sessionState);
    if (signature === lastBroadcastSessionSignature) return;
    lastRemoteSessionSignature = signature;
    void applyRemoteSessionState(message.sessionState);
  };

  syncListenerAttached = true;
};

export const broadcastCue = (trackHash: string, cueData: CueSyncPayload) => {
  const channel = getSyncChannel();
  if (!channel) return;

  channel.postMessage({
    type: 'NEW_CUE',
    senderId: syncClientId,
    trackHash,
    cueData,
  } satisfies SyncMessage);
};

export const broadcastLibraryRefresh = () => {
  const channel = getSyncChannel();
  if (!channel) return;

  channel.postMessage({
    type: 'LIBRARY_REFRESH',
    senderId: syncClientId,
  } satisfies SyncMessage);
};

export const broadcastSessionState = (sessionState: SessionState) => {
  const channel = getSyncChannel();
  if (!channel) return;

  const signature = JSON.stringify(sessionState);
  if (signature === lastRemoteSessionSignature || signature === lastBroadcastSessionSignature) {
    return;
  }

  lastBroadcastSessionSignature = signature;
  channel.postMessage({
    type: 'SESSION_STATE',
    senderId: syncClientId,
    sessionState,
  } satisfies SyncMessage);
};

export const saveSessionState = (sessionState: SessionState, options?: { broadcast?: boolean }) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCAL_SESSION_PERSISTENCE_KEY, JSON.stringify(sessionState));
  } catch {
    // Ignore localStorage quota/privacy mode failures so local mixing remains responsive.
  }

  if (options?.broadcast !== false) {
    broadcastSessionState(sessionState);
  }
};

export const loadSessionState = (): SessionState | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_PERSISTENCE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
};
