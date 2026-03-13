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
  self.postMessage({ bpm: Math.round(bpm), key: 'Auto' });
};
