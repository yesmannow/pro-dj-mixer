'use client';
import { useRef, useState, useCallback } from 'react';
import { AudioEngine } from '@/lib/audioEngine';

export function useMediaRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(() => {
    const stream = AudioEngine.getInstance().getRecordingStream();
    if (!stream) return;

    // Pick the best supported MIME type
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
      .find((type) => type === '' || MediaRecorder.isTypeSupported(type)) ?? '';

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const type = mr.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = type.includes('ogg') ? 'ogg' : 'webm';
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
      a.download = `dj-mix-${ts}.${ext}`;
      a.click();
      // Delay revocation to ensure download initiates before the blob URL is freed
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    mr.start();
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  }, []);

  return { isRecording, elapsedSeconds, startRecording, stopRecording };
}
