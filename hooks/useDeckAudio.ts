import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useMixerStore } from '@/store/mixerStore';
import { AudioEngine } from '@/lib/audioEngine';

export function useDeckAudio(deckId: 'A' | 'B') {
  const deckState = useDeckStore((state) => deckId === 'A' ? state.deckA : state.deckB);
  const { togglePlay, setVolume } = useDeckStore();

  const mixerState = useMixerStore();
  const eqState = deckId === 'A' ? mixerState.eqA : mixerState.eqB;
  const crossfader = mixerState.crossfader;
  const crossfaderCurve = mixerState.crossfaderCurve ?? 'blend';

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const stemChainRef = useRef<ReturnType<AudioEngine['createStemChain']> | null>(null);
  const fxBusRef = useRef<ReturnType<AudioEngine['createDeckFxBus']> | null>(null);
  const eqChainRef = useRef<ReturnType<AudioEngine['createEQChain']> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

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

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    if (!gainRef.current) {
      gainRef.current = engine.context.createGain();
      stemChainRef.current = engine.createStemChain(deckId);
      fxBusRef.current = engine.createDeckFxBus(deckId);
      eqChainRef.current = engine.createEQChain();
      analyserRef.current = engine.context.createAnalyser();
      analyserRef.current.fftSize = 256;
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

      // Connect source -> stem crossover -> FX bus -> EQ -> analyser -> gain -> destination
      stemChainRef.current.output.connect(fxBusRef.current.input);
      fxBusRef.current.output.connect(eqChainRef.current.input);
      eqChainRef.current.output.connect(analyserRef.current);
      analyserRef.current.connect(gainRef.current);
      gainRef.current.connect(engine.context.destination);
    }

    if (gainRef.current) {
      // Calculate final volume based on deck volume and crossfader
      const { gainA, gainB } = engine.getCrossfaderGains(crossfader, crossfaderCurve);
      const crossfaderGain = deckId === 'A' ? gainA : gainB;
      gainRef.current.gain.value = deckState.volume * crossfaderGain;
    }

    if (eqChainRef.current) {
      const mapEQ = (val: number) => val < 0 ? val * 24 : val * 6;
      eqChainRef.current.low.gain.value = mapEQ(eqState.low);
      eqChainRef.current.mid.gain.value = mapEQ(eqState.mid);
      eqChainRef.current.high.gain.value = mapEQ(eqState.high);
    }
  }, [deckState.volume, crossfader, crossfaderCurve, eqState, deckId]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    const stopAudio = () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };

    const playAudio = async () => {
      if (!deckState.buffer || !gainRef.current || !eqChainRef.current || !stemChainRef.current || !fxBusRef.current) return;

      await engine.resume();

      stopAudio();

      sourceRef.current = engine.createPitchLockedSource(deckState.buffer);
      sourceRef.current.playbackRate.value = 1;

      // Connect source to stem crossover input
      sourceRef.current.connect(stemChainRef.current.input);

      sourceRef.current.start(0, pauseTimeRef.current);

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

          if (newTime >= deckState.buffer.duration) {
            togglePlay(deckId);
            pauseTimeRef.current = 0;
            currentTimeRef.current = 0;
            setCurrentTime(0);
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
  }, [deckState.isPlaying, deckState.buffer, deckId, togglePlay]);

  useEffect(() => {
    if (!sourceRef.current) return;
    const targetRate = Math.max(0.5, Math.min(2.0, 1 + deckState.pitchPercent / 100));
    sourceRef.current.playbackRate.setTargetAtTime(
      targetRate,
      AudioEngine.getInstance().context.currentTime,
      0.02
    );
  }, [deckState.pitchPercent]);

  useEffect(() => {
    const bpm = Number(deckState.track?.bpm);
    const validBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
    const halfBeatSeconds = 60 / validBpm / 2;
    const engine = AudioEngine.getInstance();
    engine.createDeckFxBus(deckId);
    engine.setDeckDelay(deckId, halfBeatSeconds, 0.35, 0);
    engine.setDeckReverb(deckId, 0);
  }, [deckId, deckState.track?.id, deckState.track?.bpm]);

  // Reset pause time when a new track is loaded
  useEffect(() => {
    pauseTimeRef.current = 0;
    currentTimeRef.current = 0;
    const timer = setTimeout(() => setCurrentTime(0), 0);
    return () => clearTimeout(timer);
  }, [deckState.track]);

  const scrubTrack = useCallback((timeDelta: number) => {
    if (!deckState.buffer) return;

    if (!deckState.isPlaying) {
      let newTime = pauseTimeRef.current + timeDelta;
      newTime = Math.max(0, Math.min(newTime, deckState.buffer.duration));
      pauseTimeRef.current = newTime;
      currentTimeRef.current = newTime;
      setCurrentTime(newTime);
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
  }, [deckState.buffer, deckState.isPlaying]);

  const endScrub = useCallback(() => {
    if (sourceRef.current && deckState.isPlaying) {
      sourceRef.current.playbackRate.setTargetAtTime(
        1.0,
        AudioEngine.getInstance().context.currentTime,
        0.1
      );
    }
  }, [deckState.isPlaying]);

  const getAudioData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return { rms: 0, low: 0, mid: 0, high: 0 };
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);

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
