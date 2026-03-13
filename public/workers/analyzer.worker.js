// Simple key-to-Camelot mapping based on chroma analysis
const KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CAMELOT_MAP = {
  'C': '8B', 'C#': '3B', 'D': '10B', 'D#': '5B', 'E': '12B', 'F': '7B',
  'F#': '2B', 'G': '9B', 'G#': '4B', 'A': '11B', 'A#': '6B', 'B': '1B'
};

function estimateKey(data, sampleRate) {
  // Simple chroma energy estimation using autocorrelation at note frequencies
  const chromaEnergy = new Float64Array(12);
  const baseFreq = 130.81; // C3
  const windowSize = Math.min(data.length, sampleRate * 4);

  for (let note = 0; note < 12; note++) {
    const freq = baseFreq * Math.pow(2, note / 12);
    const period = sampleRate / freq;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < windowSize - Math.ceil(period); i++) {
      sum += data[i] * data[i + Math.round(period)];
      count++;
    }
    chromaEnergy[note] = count > 0 ? sum / count : 0;
  }

  let maxIdx = 0;
  let maxVal = chromaEnergy[0];
  for (let i = 1; i < 12; i++) {
    if (chromaEnergy[i] > maxVal) {
      maxVal = chromaEnergy[i];
      maxIdx = i;
    }
  }

  const keyName = KEY_LABELS[maxIdx];
  return CAMELOT_MAP[keyName] || '8B';
}

self.onmessage = async (e) => {
  const { audioData, sampleRate } = e.data;
  const getPeaks = (data) => {
    const partSize = sampleRate / 2;
    const peaks = [];
    for (let i = 0; i < data.length; i += partSize) {
      let max = 0;
      const end = Math.min(i + partSize, data.length);
      for (let j = i; j < end; j++) {
        if (data[j] > max) max = data[j];
      }
      peaks.push(max);
    }
    return peaks;
  };
  const peaks = getPeaks(audioData);
  const bpm = (peaks.length / (audioData.length / sampleRate)) * 60;
  const key = estimateKey(audioData, sampleRate);
  self.postMessage({ bpm: Math.round(bpm), key });
};
