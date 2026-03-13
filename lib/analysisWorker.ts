export interface AnalysisRequest {
  id: string;
  channelData: Float32Array;
  sampleRate: number;
  duration: number;
}

export interface AnalysisResponse {
  id: string;
  bpm: number;
  duration: number;
  overviewPeaks: Float32Array;
  error: string | null;
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

const computeEnergies = (samples: Float32Array, windowSize: number, hopSize: number): number[] => {
  const energies: number[] = [];
  for (let i = 0; i + windowSize < samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = samples[i + j];
      sum += v * v;
    }
    energies.push(Math.sqrt(sum / windowSize));
  }
  return energies;
};

const calculateMeanAndStd = (energies: number[]): { mean: number; std: number } => {
  let mean = 0;
  for (const e of energies) mean += e;
  mean /= energies.length;

  let variance = 0;
  for (const e of energies) {
    const d = e - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / energies.length);
  return { mean, std };
};

const findPeakTimes = (energies: number[], threshold: number, hopSize: number, sampleRate: number): number[] => {
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
  return peakTimes;
};

const buildBpmHistogram = (peakTimes: number[]): Map<number, number> => {
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
  return histogram;
};

const findBestBpm = (histogram: Map<number, number>): number => {
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

const estimateBpm = (samples: Float32Array, sampleRate: number): number => {
  const windowSize = 1024;
  const hopSize = 1024;

  const energies = computeEnergies(samples, windowSize, hopSize);
  if (energies.length < 4) return DEFAULT_BPM;

  const { mean, std } = calculateMeanAndStd(energies);
  const threshold = mean + std * 1.5;

  const peakTimes = findPeakTimes(energies, threshold, hopSize, sampleRate);
  if (peakTimes.length < 2) return DEFAULT_BPM;

  const histogram = buildBpmHistogram(peakTimes);
  if (histogram.size === 0) return DEFAULT_BPM;

  return findBestBpm(histogram);
};

const handleAnalyze = (request: AnalysisRequest): AnalysisResponse => {
  const overviewPeaks = computeOverviewPeaks(request.channelData, 500);
  const bpm = estimateBpm(request.channelData, request.sampleRate);

  return { id: request.id, bpm, duration: request.duration, overviewPeaks, error: null };
};

const ctx = globalThis as any;

ctx.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  const request = event.data;
  try {
    if (!request.channelData || typeof request.sampleRate !== 'number' || typeof request.duration !== 'number') {
      throw new Error('Invalid analysis request: expected channelData, sampleRate, duration.');
    }

    const response = handleAnalyze(request);
    ctx.postMessage(response, [response.overviewPeaks.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const response: AnalysisResponse = {
      id: request?.id ?? 'unknown',
      bpm: DEFAULT_BPM,
      duration: request?.duration ?? 0,
      overviewPeaks: new Float32Array(500),
      error: message,
    };
    ctx.postMessage(response);
  }
};
