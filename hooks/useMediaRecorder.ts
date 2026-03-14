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
const MIN_24BIT_SIGNED = 0x800000;
const MAX_24BIT_POSITIVE = 0x7fffff;
const FULL_24BIT_RANGE = 0x1000000;

const formatSetTimestamp = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

function makeSaturationCurve(amount = 20) {
  const n = 44100;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / n - 1;
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const mergeChunks = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const encode24BitWav = (leftChannel: Float32Array, rightChannel: Float32Array, sampleRate: number) => {
  const frameCount = Math.min(leftChannel.length, rightChannel.length);
  const blockAlign = 2 * 3;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < frameCount; index += 1) {
    [leftChannel[index], rightChannel[index]].forEach((sample) => {
      const clamped = Math.max(-1, Math.min(1, sample));
      const scaled = clamped < 0 ? Math.round(clamped * MIN_24BIT_SIGNED) : Math.round(clamped * MAX_24BIT_POSITIVE);
      const twosComplement = scaled < 0 ? scaled + FULL_24BIT_RANGE : scaled;
      view.setUint8(offset, twosComplement & 0xff);
      view.setUint8(offset + 1, (twosComplement >> 8) & 0xff);
      view.setUint8(offset + 2, (twosComplement >> 16) & 0xff);
      offset += 3;
    });
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

export function useMediaRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const sessionSnapshotRef = useRef<SessionState | null>(null);
  const trackEventsRef = useRef<RecordedTrackEvent[]>([]);
  const lastTrackHashesRef = useRef<Record<'A' | 'B', string | null>>({ A: null, B: null });
  const recordingTimestampRef = useRef<string>('');
  const recorderContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const channelChunksRef = useRef<[Float32Array[], Float32Array[]]>([[], []]);

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
    if (typeof window === 'undefined') return;
    if (recorderContextRef.current) return;

    const engine = AudioEngine.getInstance();
    const stream = engine.getRecordingStream();
    if (!stream) return;
    const recordingProfile = engine.getRecordingProfile();
    const RecorderContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!RecorderContextCtor) return;

    const recorderContext = new RecorderContextCtor({ sampleRate: recordingProfile.sampleRate });
    const sourceNode = recorderContext.createMediaStreamSource(stream);
    const saturationNode = recorderContext.createWaveShaper();
    saturationNode.curve = makeSaturationCurve(20);
    saturationNode.oversample = '4x';
    const channelSplitter = recorderContext.createChannelSplitter(2);
    const rightHaasDelay = recorderContext.createDelay(0.018);
    rightHaasDelay.delayTime.value = 0.018;
    const channelMerger = recorderContext.createChannelMerger(2);
    const processorNode = recorderContext.createScriptProcessor(4096, 2, 2);
    const monitorGain = recorderContext.createGain();
    monitorGain.gain.value = 0;
    sourceNode.connect(saturationNode);
    saturationNode.connect(channelSplitter);
    channelSplitter.connect(channelMerger, 0, 0);
    channelSplitter.connect(rightHaasDelay, 1);
    rightHaasDelay.connect(channelMerger, 0, 1);
    channelMerger.connect(processorNode);
    processorNode.connect(monitorGain);
    monitorGain.connect(recorderContext.destination);

    channelChunksRef.current = [[], []];
    processorNode.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      const left = new Float32Array(inputBuffer.getChannelData(0));
      const right = inputBuffer.numberOfChannels > 1
        ? new Float32Array(inputBuffer.getChannelData(1))
        : new Float32Array(inputBuffer.getChannelData(0));
      channelChunksRef.current[0].push(left);
      channelChunksRef.current[1].push(right);
    };

    elapsedRef.current = 0;
    trackEventsRef.current = [];
    lastTrackHashesRef.current = { A: null, B: null };
    recordingTimestampRef.current = formatDownloadTimestamp(new Date());
    recorderContextRef.current = recorderContext;
    sourceNodeRef.current = sourceNode;
    processorNodeRef.current = processorNode;
    monitorGainRef.current = monitorGain;
    snapshotSessionState();
    captureTrackTransitions(0);
    setIsRecording(true);
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
      captureTrackTransitions(elapsedRef.current);
    }, 1000);
  }, [captureTrackTransitions, snapshotSessionState]);

  const stopRecording = useCallback(() => {
    const recorderContext = recorderContextRef.current;
    if (!recorderContext) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    captureTrackTransitions(elapsedRef.current);
    snapshotSessionState();
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    monitorGainRef.current?.disconnect();
    const sessionState = sessionSnapshotRef.current ?? snapshotSessionState();
    const recordingProfile = AudioEngine.getInstance().getRecordingProfile();
    const ts = recordingTimestampRef.current || formatDownloadTimestamp(new Date());
    const leftChannel = mergeChunks(channelChunksRef.current[0]);
    const rightChannel = mergeChunks(channelChunksRef.current[1]);
    const wavBlob = encode24BitWav(leftChannel, rightChannel, recordingProfile.sampleRate);
    const setlistLines = [
      'PRO DJ STUDIO SETLIST',
      `Capture: ${ts}`,
      `Master Tap Point: ${recordingProfile.signalPath}`,
      `Render Target: ${Math.round(recordingProfile.sampleRate / 1000)}kHz / ${recordingProfile.bitDepth}-bit WAV`,
      '',
      ...trackEventsRef.current.map((event) => {
        const trackEntry = sessionState.trackHashes[event.trackHash];
        const label = trackEntry ? `${trackEntry.artist} — ${trackEntry.title}` : event.trackHash;
        return `[${formatSetTimestamp(event.elapsedSeconds)}] Deck ${event.deckId} • ${label}`;
      }),
    ];

    void recorderContext.close();
    recorderContextRef.current = null;
    sourceNodeRef.current = null;
    processorNodeRef.current = null;
    monitorGainRef.current = null;
    channelChunksRef.current = [[], []];

    downloadBlob(wavBlob, `dj-mix-${ts}.wav`);
    downloadBlob(new Blob([setlistLines.join('\n')], { type: 'text/plain;charset=utf-8' }), `dj-mix-${ts}-setlist.txt`);
    setIsRecording(false);
  }, [captureTrackTransitions, snapshotSessionState]);

  return { isRecording, elapsedSeconds, startRecording, stopRecording };
}
