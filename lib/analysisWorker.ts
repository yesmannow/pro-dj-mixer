export interface AnalysisRequest {
  id: string;
  buffer?: ArrayBuffer;
  url?: string;
  filename?: string;
}

export interface AnalysisResponse {
  id: string;
  bpm: number;
  duration: number;
  overviewPeaks: Float32Array;
  title?: string;
  artist?: string;
  albumArt?: string;
  keySignature?: string;
  error?: string;
}

const DEFAULT_BPM = 120;
const MIN_BPM = 60;
const MAX_BPM = 200;

const computeOverviewPeaks = (samples: Float32Array, size: number) => {
  const total = samples.length;
  const peaks = new Float32Array(size);
  const segmentSize = Math.max(1, Math.floor(total / size));

  for (let i = 0; i < size; i++) {
    const start = i * segmentSize;
    if (start >= total) {
      peaks[i] = 0;
      continue;
    }
    const end = i === size - 1 ? total : Math.min(total, start + segmentSize);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  return peaks;
};

const mixDown = (buffer: AudioBuffer) => {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

  const length = buffer.length;
  const mix = new Float32Array(length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mix[i] += data[i];
    }
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < length; i++) {
    mix[i] *= scale;
  }
  return mix;
};

const estimateBpm = (samples: Float32Array, sampleRate: number) => {
  const windowSize = 1024;
  const hopSize = 1024;

  const energies: number[] = [];
  for (let i = 0; i + windowSize < samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = samples[i + j];
      sum += v * v;
    }
    energies.push(Math.sqrt(sum / windowSize));
  }

  if (energies.length < 4) return DEFAULT_BPM;

  let mean = 0;
  for (const e of energies) mean += e;
  mean /= energies.length;

  let variance = 0;
  for (const e of energies) {
    const d = e - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / energies.length);
  const threshold = mean + std * 1.5;

  const peakTimes: number[] = [];
  for (let i = 1; i < energies.length - 1; i++) {
    const prev = energies[i - 1];
    const next = energies[i + 1];
    const current = energies[i];
    if (current > threshold && current >= prev && current >= next) {
      const time = (i * hopSize) / sampleRate;
      peakTimes.push(time);
    }
  }

  if (peakTimes.length < 2) return DEFAULT_BPM;

  const histogram = new Map<number, number>();
  for (let i = 1; i < peakTimes.length; i++) {
    const interval = peakTimes[i] - peakTimes[i - 1];
    if (interval <= 0) continue;
    let bpm = 60 / interval;
    while (bpm < MIN_BPM) bpm *= 2;
    while (bpm > MAX_BPM) bpm /= 2;
    const rounded = Math.round(bpm);
    histogram.set(rounded, (histogram.get(rounded) ?? 0) + 1);
  }

  if (histogram.size === 0) return DEFAULT_BPM;

  let bestBpm = DEFAULT_BPM;
  let bestCount = 0;
  for (const [bpm, count] of histogram) {
    if (count > bestCount) {
      bestCount = count;
      bestBpm = bpm;
    }
  }

  return bestBpm;
};

const handleAnalyze = async (request: AnalysisRequest & { buffer: ArrayBuffer }): Promise<AnalysisResponse> => {
  const offlineContext = new OfflineAudioContext(1, 1, 44100);
  const decoded = await offlineContext.decodeAudioData(request.buffer.slice(0));
  const mono = mixDown(decoded);
  const overviewPeaks = computeOverviewPeaks(mono, 500);
  const bpm = estimateBpm(mono, decoded.sampleRate);

  return {
    id: request.id,
    bpm,
    duration: decoded.duration,
    overviewPeaks
  };
};

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  try {
    let buffer: ArrayBuffer | undefined = request.buffer;

    if (!buffer && request.url) {
      const response = await fetch(request.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio from cloud: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/xml')) {
        throw new Error('Cloudflare returned an XML error instead of an audio file. Check the exact file URL/Path.');
      }
      buffer = await response.arrayBuffer();
    }

    if (!buffer) {
      throw new Error('No audio data provided');
    }

    const response = await handleAnalyze({ ...request, buffer });
    ctx.postMessage(response, [response.overviewPeaks.buffer]);
  } catch (error) {
    console.error('analysisWorker failed to analyze audio:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const response: AnalysisResponse = {
      id: request.id,
      bpm: DEFAULT_BPM,
      duration: 0,
      overviewPeaks: new Float32Array(500),
      error: message
    };
    ctx.postMessage(response);
  }
};
