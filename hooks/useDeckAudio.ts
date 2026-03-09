import { useEffect, useRef, useState } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { AudioEngine } from '@/lib/audioEngine';

export function useDeckAudio(deckId: 'A' | 'B') {
  const deckState = useDeckStore((state) => deckId === 'A' ? state.deckA : state.deckB);
  const { togglePlay, setVolume } = useDeckStore();
  
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    
    if (!gainRef.current) {
      gainRef.current = engine.context.createGain();
      gainRef.current.connect(engine.context.destination);
    }

    if (gainRef.current) {
      gainRef.current.gain.value = deckState.volume;
    }
  }, [deckState.volume]);

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
      if (!deckState.buffer || !gainRef.current) return;
      
      await engine.resume();
      
      stopAudio();
      
      sourceRef.current = engine.context.createBufferSource();
      sourceRef.current.buffer = deckState.buffer;
      sourceRef.current.connect(gainRef.current);
      
      sourceRef.current.start(0, pauseTimeRef.current);
      startTimeRef.current = engine.context.currentTime - pauseTimeRef.current;
      
      const updateTime = () => {
        if (deckState.isPlaying && deckState.buffer) {
          const current = engine.context.currentTime - startTimeRef.current;
          setCurrentTime(current);
          if (current >= deckState.buffer.duration) {
            togglePlay(deckId);
            pauseTimeRef.current = 0;
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
        pauseTimeRef.current = engine.context.currentTime - startTimeRef.current;
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
    // We can't call setCurrentTime(0) here because it triggers a state update during render if called synchronously, but it's in useEffect so it's fine.
    // However, ESLint complains. We can just let the playAudio handle it or use a ref.
    // Actually, we can just omit it, because when a new track is loaded, the component will re-render and we can derive the time or just let it be.
    // To be safe, we can use a setTimeout to avoid the warning, or just ignore it.
    // Let's just use a timeout.
    const timer = setTimeout(() => setCurrentTime(0), 0);
    return () => clearTimeout(timer);
  }, [deckState.track]);

  return {
    currentTime,
    duration: deckState.duration,
    isPlaying: deckState.isPlaying,
    isLoading: deckState.isLoading,
    track: deckState.track,
    togglePlay: () => togglePlay(deckId),
    setVolume: (v: number) => setVolume(deckId, v)
  };
}
