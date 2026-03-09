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
  
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const eqChainRef = useRef<ReturnType<AudioEngine['createEQChain']> | null>(null);
  
  const pauseTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const lastContextTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    
    if (!gainRef.current) {
      gainRef.current = engine.context.createGain();
      eqChainRef.current = engine.createEQChain();
      
      // Connect EQ output to Gain, Gain to destination
      eqChainRef.current.output.connect(gainRef.current);
      gainRef.current.connect(engine.context.destination);
    }

    if (gainRef.current) {
      // Calculate final volume based on deck volume and crossfader
      const { gainA, gainB } = engine.getEqualPowerGains(crossfader);
      const crossfaderGain = deckId === 'A' ? gainA : gainB;
      gainRef.current.gain.value = deckState.volume * crossfaderGain;
    }
    
    if (eqChainRef.current) {
      const mapEQ = (val: number) => val < 0 ? val * 24 : val * 6;
      eqChainRef.current.low.gain.value = mapEQ(eqState.low);
      eqChainRef.current.mid.gain.value = mapEQ(eqState.mid);
      eqChainRef.current.high.gain.value = mapEQ(eqState.high);
    }
  }, [deckState.volume, crossfader, eqState, deckId]);

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
      if (!deckState.buffer || !gainRef.current || !eqChainRef.current) return;
      
      await engine.resume();
      
      stopAudio();
      
      sourceRef.current = engine.context.createBufferSource();
      sourceRef.current.buffer = deckState.buffer;
      
      // Connect source to EQ input
      sourceRef.current.connect(eqChainRef.current.input);
      
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

  return {
    currentTime,
    duration: deckState.duration,
    isPlaying: deckState.isPlaying,
    isLoading: deckState.isLoading,
    track: deckState.track,
    togglePlay: () => togglePlay(deckId),
    setVolume: (v: number) => setVolume(deckId, v),
    scrubTrack,
    endScrub
  };
}
