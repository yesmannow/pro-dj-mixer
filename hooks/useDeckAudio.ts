import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useMixerStore } from '@/store/mixerStore';
import { AudioEngine } from '@/lib/audioEngine';

interface AudioDataSnapshot {
  rms: number;
  low: number;
  mid: number;
  high: number;
}

export function useDeckAudio(deckId: 'A' | 'B') {
  const deckState = useDeckStore((state) => deckId === 'A' ? state.deckA : state.deckB);
  const { togglePlay, setVolume, setCurrentTime: setDeckCurrentTime } = useDeckStore();

  const mixerState = useMixerStore();
  const eqState = deckId === 'A' ? mixerState.eqA : mixerState.eqB;
  const crossfader = mixerState.crossfader;
  const crossfaderCurve = mixerState.crossfaderCurve ?? 'blend';

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stemChainRef = useRef<ReturnType<AudioEngine['createStemChain']> | null>(null);
  const fxBusRef = useRef<ReturnType<AudioEngine['createDeckFxBus']> | null>(null);
  const eqChainRef = useRef<ReturnType<AudioEngine['createEQChain']> | null>(null);
  const deckGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const pauseTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const lastContextTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [mutedStems, setMutedStems] = useState<{ drums: boolean; inst: boolean; vocals: boolean }>({
    drums: false,
    inst: false,
    vocals: false
  });

  const syncRuntime = useCallback(() => {
    const engine = AudioEngine.getInstance();
    const runtimePlaybackRate = Math.max(0.5, Math.min(2.0, 1 + deckState.pitchPercent / 100));

    engine.registerDeckRuntime(deckId, {
      buffer: deckState.buffer,
      source: sourceRef.current,
      stemInput: stemChainRef.current?.input ?? null,
      deckGain: deckGainRef.current,
      isPlaying: deckState.isPlaying,
      playbackRate: runtimePlaybackRate,
      pauseTime: pauseTimeRef.current,
      onSourceSwap: (next) => {
        sourceRef.current = next;
        lastContextTimeRef.current = engine.context.currentTime;
        currentTimeRef.current = pauseTimeRef.current;
      },
      onPauseTime: (nextTime) => {
        pauseTimeRef.current = nextTime;
        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
        setDeckCurrentTime(deckId, nextTime);
      }
    });
  }, [deckId, deckState.buffer, deckState.isPlaying, deckState.pitchPercent, setDeckCurrentTime]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    if (!deckGainRef.current) {
      stemChainRef.current = engine.createStemChain(deckId);
      fxBusRef.current = engine.createDeckFxBus(deckId);
      eqChainRef.current = engine.createEQChain();
      analyserRef.current = engine.context.createAnalyser();
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      engine.registerDeckAnalyser(deckId, analyserRef.current);

      deckGainRef.current = fxBusRef.current.deckGain;

      // Connect source -> stem crossover -> FX bus -> EQ -> analyser -> destination
      stemChainRef.current.output.connect(fxBusRef.current.input);
      fxBusRef.current.output.connect(eqChainRef.current.input);
      eqChainRef.current.output.connect(analyserRef.current);
      analyserRef.current.connect(engine.masterGain);
    }

    syncRuntime();

    if (deckGainRef.current) {
      // Calculate final volume based on deck volume and crossfader
      const { gainA, gainB } = engine.getCrossfaderGains(crossfader, crossfaderCurve);
      const crossfaderGain = deckId === 'A' ? gainA : gainB;
      const targetGain = deckState.volume * crossfaderGain;
      deckGainRef.current.gain.setTargetAtTime(targetGain, engine.context.currentTime, 0.03);
    }

    if (eqChainRef.current) {
      const mapEQ = (val: number) => val < 0 ? val * 24 : val * 6;
      const now = engine.context.currentTime;
      eqChainRef.current.low.gain.setTargetAtTime(mapEQ(eqState.low), now, 0.02);
      eqChainRef.current.mid.gain.setTargetAtTime(mapEQ(eqState.mid), now, 0.02);
      eqChainRef.current.high.gain.setTargetAtTime(mapEQ(eqState.high), now, 0.02);
    }
  }, [deckState.volume, crossfader, crossfaderCurve, eqState, deckId, syncRuntime]);

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

      sourceRef.current = engine.createPitchLockedSource(deckState.buffer);
      sourceRef.current.playbackRate.value = 1;

      // Connect source to stem crossover input
      sourceRef.current.connect(stemChainRef.current.input);

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
          setCurrentTime(newTime);
          setDeckCurrentTime(deckId, newTime);

          if (newTime >= deckState.buffer.duration) {
            togglePlay(deckId);
            pauseTimeRef.current = 0;
            currentTimeRef.current = 0;
            setCurrentTime(0);
            setDeckCurrentTime(deckId, 0);
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
  }, [deckId, deckState.buffer, deckState.isPlaying, setDeckCurrentTime, syncRuntime, togglePlay]);

  useEffect(() => {
    if (!sourceRef.current) return;
    const targetRate = Math.max(0.5, Math.min(2.0, 1 + deckState.pitchPercent / 100));
    sourceRef.current.playbackRate.setTargetAtTime(
      targetRate,
      AudioEngine.getInstance().context.currentTime,
      0.02
    );
    syncRuntime();
  }, [deckState.pitchPercent, syncRuntime]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    engine.createDeckFxBus(deckId);
    engine.setDeckFX(deckId, 'echo', 0);
    engine.setDeckFX(deckId, 'filter', 50);
    engine.setDeckFX(deckId, 'crush', 0);
  }, [deckId, deckState.track?.id, deckState.track?.bpm]);

  // Reset pause time when a new track is loaded
  useEffect(() => {
    pauseTimeRef.current = 0;
    currentTimeRef.current = 0;
    const timer = setTimeout(() => setCurrentTime(0), 0);
    syncRuntime();
    setDeckCurrentTime(deckId, 0);
    return () => clearTimeout(timer);
  }, [deckState.track, syncRuntime, deckId, setDeckCurrentTime]);

  const scrubTrack = useCallback((timeDelta: number) => {
    if (!deckState.buffer) return;

    if (!deckState.isPlaying) {
      let newTime = pauseTimeRef.current + timeDelta;
      newTime = Math.max(0, Math.min(newTime, deckState.buffer.duration));
      pauseTimeRef.current = newTime;
      currentTimeRef.current = newTime;
      setCurrentTime(newTime);
      setDeckCurrentTime(deckId, newTime);
      syncRuntime();
    } else {
      if (sourceRef.current) {
        const rate = 1.0 + timeDelta * 10;
        sourceRef.current.playbackRate.setTargetAtTime(
          Math.max(0.5, Math.min(2.0, rate)),
          AudioEngine.getInstance().context.currentTime,
          0.05
        );
      }
    }
  }, [deckId, deckState.buffer, deckState.isPlaying, setDeckCurrentTime, syncRuntime]);

  const endScrub = useCallback(() => {
    if (sourceRef.current && deckState.isPlaying) {
      sourceRef.current.playbackRate.setTargetAtTime(
        1.0,
        AudioEngine.getInstance().context.currentTime,
        0.1
      );
    }
  }, [deckState.isPlaying]);

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

  const toggleStemMute = useCallback((stemType: 'drums' | 'inst' | 'vocals') => {
    setMutedStems((prev) => {
      const nextMuted = !prev[stemType];
      AudioEngine.getInstance().setStemMute(deckId, stemType, nextMuted);
      return {
        ...prev,
        [stemType]: nextMuted
      };
    });
  }, [deckId]);

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
    mutedStems,
    toggleStemMute
  };
}
