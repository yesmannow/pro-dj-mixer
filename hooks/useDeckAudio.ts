import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useMixerStore } from '@/store/mixerStore';
import { AudioEngine } from '@/lib/audioEngine';
import { useShallow } from 'zustand/react/shallow';

interface AudioDataSnapshot {
  rms: number;
  low: number;
  mid: number;
  high: number;
}

export function useDeckAudio(deckId: 'A' | 'B') {
  const deckState = useDeckStore(useShallow((state) => {
    const deck = deckId === 'A' ? state.deckA : state.deckB;
    return {
      track: deck.track,
      isPlaying: deck.isPlaying,
      duration: deck.duration,
      buffer: deck.buffer,
      isLoading: deck.isLoading,
      volume: deck.volume,
      pitchPercent: deck.pitchPercent,
      stems: deck.stems,
    };
  }));
  const togglePlay = useDeckStore((state) => state.togglePlay);
  const setVolume = useDeckStore((state) => state.setVolume);
  const setDeckCurrentTime = useDeckStore((state) => state.setCurrentTime);

  const eqState = useMixerStore((state) => (deckId === 'A' ? state.eqA : state.eqB));
  const crossfader = useMixerStore((state) => state.crossfader);
  const crossfaderCurve = useMixerStore((state) => state.crossfaderCurve ?? 'blend');

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stemChainRef = useRef<ReturnType<AudioEngine['createStemChain']> | null>(null);
  const fxBusRef = useRef<Awaited<ReturnType<AudioEngine['createDeckFxBus']>> | null>(null);
  const eqChainRef = useRef<ReturnType<AudioEngine['createEQChain']> | null>(null);
  const deckGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const pauseTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const lastContextTimeRef = useRef<number>(0);
  const lastStoreTimeCommitRef = useRef<number>(0);
  const lastUiTimePaintRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const basePlaybackRate = Math.max(0.5, Math.min(2.0, 1 + deckState.pitchPercent / 100));

  const commitDeckTime = useCallback((time: number, force = false) => {
    const commitInterval = 1 / 30; // 30 Hz commit rate to avoid global-store thrash.
    if (!force && Math.abs(time - lastStoreTimeCommitRef.current) < commitInterval) {
      return;
    }
    lastStoreTimeCommitRef.current = time;
    setDeckCurrentTime(deckId, time);
  }, [deckId, setDeckCurrentTime]);

  const syncRuntime = useCallback(() => {
    const engine = AudioEngine.getInstance();
      engine.registerDeckRuntime(deckId, {
        buffer: deckState.buffer,
        source: sourceRef.current,
        stemInput: stemChainRef.current?.input ?? null,
        deckGain: deckGainRef.current,
        isPlaying: deckState.isPlaying,
        playbackRate: basePlaybackRate,
        pauseTime: pauseTimeRef.current,
        currentTime: currentTimeRef.current,
      onSourceSwap: (next) => {
        sourceRef.current = next;
        lastContextTimeRef.current = engine.context.currentTime;
        currentTimeRef.current = pauseTimeRef.current;
      },
      onPauseTime: (nextTime) => {
        pauseTimeRef.current = nextTime;
        currentTimeRef.current = nextTime;
        lastUiTimePaintRef.current = nextTime;
        setCurrentTime(nextTime);
        commitDeckTime(nextTime, true);
      }
    });
  }, [basePlaybackRate, commitDeckTime, deckId, deckState.buffer, deckState.isPlaying]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    let cancelled = false;

    const setupGraph = async () => {
      if (deckGainRef.current) {
        return;
      }

      stemChainRef.current = engine.createStemChain(deckId);
      fxBusRef.current = await engine.createDeckFxBus(deckId);
      if (cancelled || !stemChainRef.current || !fxBusRef.current) {
        return;
      }

      eqChainRef.current = engine.createEQChain();
      analyserRef.current = engine.context.createAnalyser();
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(new ArrayBuffer(analyserRef.current.frequencyBinCount));
      engine.registerDeckAnalyser(deckId, analyserRef.current);

      deckGainRef.current = fxBusRef.current.deckGain;

      // Connect source -> stem routing -> [direct + FX send] -> EQ/analyser/master
      stemChainRef.current.output.connect(eqChainRef.current.input);
      stemChainRef.current.fxOutput.connect(fxBusRef.current.input);
      fxBusRef.current.output.connect(eqChainRef.current.input);
      eqChainRef.current.output.connect(analyserRef.current);
      analyserRef.current.connect(engine.masterGain);
    };

    void setupGraph().then(() => {
      if (cancelled) return;
      syncRuntime();

      if (deckGainRef.current) {
        const { gainA, gainB } = engine.getCrossfaderGains(crossfader, crossfaderCurve);
        const crossfaderGain = deckId === 'A' ? gainA : gainB;
        const targetGain = deckState.volume * crossfaderGain;
        deckGainRef.current.gain.setTargetAtTime(targetGain, engine.context.currentTime, 0.03);
      }

      if (eqChainRef.current) {
        const neuralPosition = (crossfader + 1) / 2;
        const neuralLowTrim =
          crossfaderCurve === 'neural'
            ? deckId === 'A'
              ? Math.max(0, (neuralPosition - 0.6) / 0.4)
              : Math.max(0, (0.4 - neuralPosition) / 0.4)
            : 0;
        const vocalBlend =
          crossfaderCurve === 'neural' && deckId === 'A'
            ? 1 - Math.max(0, Math.min(1, neuralPosition / 0.4))
            : 1;
        engine.setStemLevel(deckId, 'vocals', deckState.stems.vocals ? vocalBlend : 0);
        engine.setStemLevel(deckId, 'drums', deckState.stems.drums ? 1 : 0);
        engine.setStemLevel(deckId, 'inst', deckState.stems.inst ? 1 : 0);

        const mapEQ = (val: number) => val < 0 ? val * 24 : val * 6;
        const now = engine.context.currentTime;
        eqChainRef.current.low.gain.setTargetAtTime(Math.max(-24, mapEQ(eqState.low) - neuralLowTrim * 18), now, 0.02);
        eqChainRef.current.mid.gain.setTargetAtTime(mapEQ(eqState.mid), now, 0.02);
        eqChainRef.current.high.gain.setTargetAtTime(mapEQ(eqState.high), now, 0.02);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deckId, deckState.stems, deckState.volume, crossfader, crossfaderCurve, eqState, syncRuntime]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const stopAudio = () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          // Ignore if already stopped
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      syncRuntime();
    };

    const playAudio = async () => {
      if (!deckState.buffer || !eqChainRef.current || !stemChainRef.current || !fxBusRef.current) return;

      await engine.resume();

      stopAudio();

      sourceRef.current = engine.createPitchLockedSource(deckId, deckState.buffer);

      // Connect source to stem crossover input
      sourceRef.current.connect(stemChainRef.current.input);
      engine.setDeckPlaybackRate(deckId, basePlaybackRate);

      sourceRef.current.start(0, pauseTimeRef.current);

      syncRuntime();

      currentTimeRef.current = pauseTimeRef.current;
      lastContextTimeRef.current = engine.context.currentTime;

      const updateTime = () => {
        if (deckState.isPlaying && deckState.buffer && sourceRef.current) {
          const now = engine.context.currentTime;
          const delta = now - lastContextTimeRef.current;
          lastContextTimeRef.current = now;

          const newTime = currentTimeRef.current + delta * sourceRef.current.playbackRate.value;
          currentTimeRef.current = newTime;
          // Keep transport text/playhead responsive while avoiding full deck rerenders every RAF.
          if (Math.abs(newTime - lastUiTimePaintRef.current) >= 1 / 45) {
            lastUiTimePaintRef.current = newTime;
            setCurrentTime(newTime);
          }
          commitDeckTime(newTime);

          if (newTime >= deckState.buffer.duration) {
            togglePlay(deckId);
            pauseTimeRef.current = 0;
            currentTimeRef.current = 0;
            lastUiTimePaintRef.current = 0;
            setCurrentTime(0);
            commitDeckTime(0, true);
          } else {
            animationRef.current = requestAnimationFrame(updateTime);
          }
        }
      };

      animationRef.current = requestAnimationFrame(updateTime);
    };

    if (deckState.isPlaying) {
      playAudio();
    } else {
      if (sourceRef.current) {
        pauseTimeRef.current = currentTimeRef.current;
      }
      stopAudio();
    }

    return () => {
      stopAudio();
    };
  }, [basePlaybackRate, commitDeckTime, deckId, deckState.buffer, deckState.isPlaying, syncRuntime, togglePlay]);

  useEffect(() => {
    if (!sourceRef.current) return;
    AudioEngine.getInstance().setDeckPlaybackRate(deckId, basePlaybackRate);
    syncRuntime();
  }, [basePlaybackRate, deckId, syncRuntime]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    void engine.createDeckFxBus(deckId).then(() => {
      engine.setDeckFX(deckId, 'echo', 0);
      engine.setDeckFX(deckId, 'filter', 50);
      engine.setDeckFX(deckId, 'crush', 0);
    });
  }, [deckId, deckState.track?.id, deckState.track?.bpm]);

  // Reset pause time when a new track is loaded
  useEffect(() => {
    pauseTimeRef.current = 0;
    currentTimeRef.current = 0;
    lastUiTimePaintRef.current = 0;
    const timer = setTimeout(() => setCurrentTime(0), 0);
    syncRuntime();
    commitDeckTime(0, true);
    return () => clearTimeout(timer);
  }, [commitDeckTime, deckId, deckState.track, syncRuntime]);

  const scrubTrack = useCallback((timeDelta: number) => {
    if (!deckState.buffer) return;

    if (!deckState.isPlaying) {
      let newTime = pauseTimeRef.current + timeDelta;
      newTime = Math.max(0, Math.min(newTime, deckState.buffer.duration));
      pauseTimeRef.current = newTime;
      currentTimeRef.current = newTime;
      lastUiTimePaintRef.current = newTime;
      setCurrentTime(newTime);
      commitDeckTime(newTime, true);
      syncRuntime();
    } else {
      if (sourceRef.current) {
        const rate = basePlaybackRate + timeDelta * 10;
        AudioEngine.getInstance().setDeckPlaybackRate(deckId, rate);
      }
    }
  }, [basePlaybackRate, commitDeckTime, deckId, deckState.buffer, deckState.isPlaying, syncRuntime]);

  const endScrub = useCallback(() => {
    if (sourceRef.current && deckState.isPlaying) {
      AudioEngine.getInstance().setDeckPlaybackRate(deckId, basePlaybackRate);
    }
  }, [basePlaybackRate, deckId, deckState.isPlaying]);

  const getAudioData = useCallback((): AudioDataSnapshot => {
    if (!analyserRef.current || !dataArrayRef.current) {
      return { rms: 0, low: 0, mid: 0, high: 0 };
    }
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    let sum = 0, lowSum = 0, midSum = 0, highSum = 0;
    const len = dataArrayRef.current.length;

    for (let i = 0; i < len; i++) {
        const val = dataArrayRef.current[i] / 255.0; // Normalize 0-1
        sum += val * val;

        if (i < len * 0.1) lowSum += val;
        else if (i < len * 0.5) midSum += val;
        else highSum += val;
    }

    return {
      rms: Math.sqrt(sum / len),
      low: lowSum / (len * 0.1),
      mid: midSum / (len * 0.4),
      high: highSum / (len * 0.5)
    };
  }, []);

  return {
    currentTime,
    duration: deckState.duration,
    isPlaying: deckState.isPlaying,
    isLoading: deckState.isLoading,
    track: deckState.track,
    togglePlay: () => togglePlay(deckId),
    setVolume: (v: number) => setVolume(deckId, v),
    play: () => { if (!deckState.isPlaying) togglePlay(deckId); },
    pause: () => { if (deckState.isPlaying) togglePlay(deckId); },
    scrubTrack,
    endScrub,
    getAudioData,
  };
}
