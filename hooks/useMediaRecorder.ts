'use client';
import { useRef, useState, useCallback } from 'react';
import { AudioEngine } from '@/lib/audioEngine';
import { buildSessionState, saveSessionState, type SessionState } from '@/lib/syncManager';
import { useDeckStore } from '@/store/deckStore';
import { useMixerStore } from '@/store/mixerStore';
import { useTrackCueStore } from '@/store/trackCueStore';

interface RecordedTrackEvent {
  deckId: 'A' | 'B';
  elapsedSeconds: number;
  trackHash: string;
}

const formatDownloadTimestamp = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;

const formatSetTimestamp = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value, index) => (index === 0 ? String(value).padStart(2, '0') : String(value).padStart(2, '0')))
    .join(':');
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};

export function useMediaRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const sessionSnapshotRef = useRef<SessionState | null>(null);
  const trackEventsRef = useRef<RecordedTrackEvent[]>([]);
  const lastTrackHashesRef = useRef<Record<'A' | 'B', string | null>>({ A: null, B: null });
  const recordingTimestampRef = useRef<string>('');

  const snapshotSessionState = useCallback(() => {
    const mixerState = useMixerStore.getState();
    const deckState = useDeckStore.getState();
    const sessionState = buildSessionState({
      deckA: deckState.deckA,
      deckB: deckState.deckB,
      mixer: {
        crossfader: mixerState.crossfader,
        crossfaderCurve: mixerState.crossfaderCurve,
        vaultAmbience: mixerState.vaultAmbience,
        volumes: {
          A: mixerState.volA,
          B: mixerState.volB,
        },
      },
      cuesByTrack: useTrackCueStore.getState().cuesByTrack,
    });
    sessionSnapshotRef.current = sessionState;
    saveSessionState(sessionState);
    return sessionState;
  }, []);

  const captureTrackTransitions = useCallback((nextElapsedSeconds: number) => {
    const sessionState = snapshotSessionState();
    (['A', 'B'] as const).forEach((deckId) => {
      const trackHash = sessionState.decks[deckId].trackHash;
      if (!trackHash) {
        lastTrackHashesRef.current[deckId] = null;
        return;
      }
      if (lastTrackHashesRef.current[deckId] === trackHash) {
        return;
      }

      lastTrackHashesRef.current[deckId] = trackHash;
      trackEventsRef.current.push({
        deckId,
        elapsedSeconds: nextElapsedSeconds,
        trackHash,
      });
    });
  }, [snapshotSessionState]);

  const startRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') return;

    const stream = AudioEngine.getInstance().getRecordingStream();
    if (!stream) return;
    const recordingProfile = AudioEngine.getInstance().getRecordingProfile();

    // Pick the best supported MIME type
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
      .find((type) => type === '' || MediaRecorder.isTypeSupported(type)) ?? '';

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    elapsedRef.current = 0;
    trackEventsRef.current = [];
    lastTrackHashesRef.current = { A: null, B: null };
    recordingTimestampRef.current = formatDownloadTimestamp(new Date());
    snapshotSessionState();
    captureTrackTransitions(0);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const type = mr.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes('ogg') ? 'ogg' : 'webm';
      const ts = recordingTimestampRef.current || formatDownloadTimestamp(new Date());
      const sessionState = sessionSnapshotRef.current ?? snapshotSessionState();
      const setlistLines = [
        'PRO DJ STUDIO SETLIST',
        `Capture: ${ts}`,
        `Master Tap: ${recordingProfile.signalPath}`,
        `Render Target: ${Math.round(recordingProfile.sampleRate / 1000)}kHz / ${recordingProfile.bitDepth}-bit`,
        '',
        ...trackEventsRef.current.map((event) => {
          const trackEntry = sessionState.trackHashes[event.trackHash];
          const label = trackEntry ? `${trackEntry.artist} — ${trackEntry.title}` : event.trackHash;
          return `[${formatSetTimestamp(event.elapsedSeconds)}] Deck ${event.deckId} • ${label}`;
        }),
      ];

      downloadBlob(blob, `dj-mix-${ts}.${ext}`);
      downloadBlob(new Blob([setlistLines.join('\n')], { type: 'text/plain;charset=utf-8' }), `dj-mix-${ts}-setlist.txt`);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
      captureTrackTransitions(elapsedRef.current);
    }, 1000);
  }, [captureTrackTransitions, snapshotSessionState]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    captureTrackTransitions(elapsedRef.current);
    snapshotSessionState();
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, [captureTrackTransitions, snapshotSessionState]);

  return { isRecording, elapsedSeconds, startRecording, stopRecording };
}
