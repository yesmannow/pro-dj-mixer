import jsmediatags from 'jsmediatags';

// Web Worker type definitions
const ctx: Worker = self as any;

export interface AnalysisRequest {
  id: string;
  buffer: ArrayBuffer;
  filename: string;
}

export interface AnalysisResponse {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  keySignature: string;
  albumArt?: string;
  overviewWaveform: number[];
}

// Ensure jsmediatags can read from an ArrayBuffer by wrapping it
class ArrayBufferReader {
  private buffer: ArrayBuffer;
  private view: DataView;
  private size: number;
  private position: number = 0;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.size = buffer.byteLength;
  }
  
  init(callbacks: any) {
    callbacks.onSuccess();
  }
  
  getSize() {
    return this.size;
  }
  
  read(length: number, position: number, callbacks: any) {
    // Basic mock reader for jsmediatags to interface with raw buffer
    // jsmediatags expects a BlobReader or a custom reader.
    // For simplicity, we just convert the ArrayBuffer to a Blob locally to parse
  }
}

// Convert ArrayBuffer to Base64 (for album art)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return self.btoa(binary);
}

// Very basic transient/peak detection for BPM (Simplified)
function calculateBPM(channelData: Float32Array, sampleRate: number): number {
  // A true BPM detector requires extensive FFT / autocorrelation logic.
  // For this optimized Phase 9 build, we'll run a fast amplitude threshold check.
  let peaks = [];
  const threshold = 0.8;
  const minPeakDistance = sampleRate / 3; // roughly 180bpm max

  let lastPeakTime = 0;
  for (let i = 0; i < channelData.length; i++) {
    if (channelData[i] > threshold) {
      if (i - lastPeakTime > minPeakDistance) {
        peaks.push(i);
        lastPeakTime = i;
      }
    }
  }

  // Calculate gaps between peaks
  if (peaks.length < 2) return 120; // Fallback
  
  let intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Find median interval
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  
  // Calculate BPM
  let bpm = Math.round(60 * sampleRate / medianInterval);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  
  return Math.round(bpm);
}

// Downsample Float32Array to 500 max peaks
function extractOverviewWaveform(channelData: Float32Array, targetLength: number = 500): number[] {
  const result: number[] = new Array(targetLength).fill(0);
  const blockSize = Math.floor(channelData.length / targetLength);
  
  if (blockSize === 0) return result;

  for (let i = 0; i < targetLength; i++) {
    let maxAbs = 0;
    const start = i * blockSize;
    const end = start + blockSize;
    
    // Only check every 10th sample in the block to save compute time (decimation)
    for (let j = start; j < end; j += 10) {
      if (j >= channelData.length) break;
      const val = Math.abs(channelData[j]);
      if (val > maxAbs) maxAbs = val;
    }
    result[i] = maxAbs;
  }

  return result;
}

ctx.addEventListener('message', async (event: MessageEvent<AnalysisRequest>) => {
  const { id, buffer, filename } = event.data;
  
  const response: AnalysisResponse = {
    id,
    title: filename.replace(/\.[^/.]+$/, ""), // Fallback title
    artist: "Unknown Artist",
    duration: 0,
    bpm: 120, // Fallback BPM
    keySignature: "8A", // Default (A Minor) for now
    overviewWaveform: []
  };

  try {
    // 1. Extract ID3 Tags (Uses BlobReader since we have the buffer)
    const blob = new Blob([buffer], { type: 'audio/mp3' }); // assume mp3/m4a
    
    await new Promise<void>((resolve) => {
      jsmediatags.read(blob as any, {
        onSuccess: (tag: any) => {
          if (tag.tags) {
            if (tag.tags.title) response.title = tag.tags.title;
            if (tag.tags.artist) response.artist = tag.tags.artist;
            if (tag.tags.picture) {
              const base64String = arrayBufferToBase64(tag.tags.picture.data);
              response.albumArt = `data:${tag.tags.picture.format};base64,${base64String}`;
            }
          }
          resolve();
        },
        onError: (error: any) => {
          console.warn('ID3 Parse Error:', error);
          resolve(); // Resolve anyway to proceed with DSP
        }
      });
    });

    // 2. Decode Audio for DSP calculation
    // Since Web Workers can't spawn full AudioContexts, we use OfflineAudioContext
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, 44100 * 60, sampleRate); // Dummy allocate
    const audioBuffer = await offlineCtx.decodeAudioData(buffer.slice(0)); // copy buffer
    
    response.duration = audioBuffer.duration;

    // 3. Process DSP (We'll use purely the Left channel to save compute)
    const channelData = audioBuffer.getChannelData(0);
    
    response.bpm = calculateBPM(channelData, audioBuffer.sampleRate);
    response.overviewWaveform = extractOverviewWaveform(channelData, 500);

    // Send the completed metadata back to the main thread
    ctx.postMessage(response);
    
  } catch (err) {
    console.error(`Worker failed to process ${filename}:`, err);
    // Return partial response so the queue doesn't hang
    ctx.postMessage(response);
  }
});
