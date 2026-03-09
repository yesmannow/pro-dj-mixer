'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { Play, Pause, RotateCcw, Repeat } from 'lucide-react';
import { AudioEngine } from '@/lib/audioEngine';

function VolumeKnob({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const deltaY = startY.current - e.clientY;
    let newValue = startValue.current + deltaY / 50;
    newValue = Math.max(0, Math.min(1, newValue));
    onChange(newValue);
  }, [onChange]);

  function handleMouseUp() {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(0.8); // Default volume
  };

  // Rotation from -135deg to +135deg
  // value is 0 to 1, so map to -135 to 135
  const rotation = -135 + value * 270;

  return (
    <div className="flex flex-col items-center absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
      <div
        className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 relative cursor-ns-resize"
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Volume"
      >
        {/* Indicator */}
        <div
          className="absolute inset-0 z-20"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 rounded-full bg-accent shadow-[0_0_2px_#00f2ff]"></div>
        </div>
      </div>
    </div>
  );
}

const SAMPLE_PACKS = {
  'Cyber FX': [
    { id: 1, name: 'Laser', type: 'oneshot', color: 'accent', freq: 800 },
    { id: 2, name: 'Impact', type: 'oneshot', color: 'rose', freq: 100 },
    { id: 3, name: 'Riser', type: 'loop', color: 'purple', freq: 200 },
    { id: 4, name: 'Drop', type: 'oneshot', color: 'yellow', freq: 50 },
    { id: 5, name: 'Alarm', type: 'loop', color: 'rose', freq: 600 },
    { id: 6, name: 'Sweep', type: 'oneshot', color: 'accent', freq: 1000 },
    { id: 7, name: 'Glitch', type: 'oneshot', color: 'green', freq: 400 },
    { id: 8, name: 'Sub Drop', type: 'oneshot', color: 'blue', freq: 60 },
  ],
  'House Kit': [
    { id: 1, name: 'Kick', type: 'oneshot', color: 'accent', freq: 150 },
    { id: 2, name: 'Clap', type: 'oneshot', color: 'accent', freq: 300 },
    { id: 3, name: 'Hat', type: 'oneshot', color: 'accent', freq: 8000 },
    { id: 4, name: 'Snare', type: 'oneshot', color: 'accent', freq: 250 },
    { id: 5, name: 'Ride', type: 'oneshot', color: 'yellow', freq: 5000 },
    { id: 6, name: 'Crash', type: 'oneshot', color: 'yellow', freq: 6000 },
    { id: 7, name: 'Tom', type: 'oneshot', color: 'green', freq: 200 },
    { id: 8, name: 'Vocal', type: 'loop', color: 'purple', freq: 440 },
  ]
};

const getColorClasses = (colorName: string, isPlaying: boolean) => {
  if (!isPlaying) return 'border-slate-800 bg-slate-900/50 hover:bg-slate-800 hover:border-slate-700';
  switch (colorName) {
    case 'accent': return 'border-accent bg-slate-800 scale-95 shadow-[0_0_15px_#00f2ff]';
    case 'rose': return 'border-rose-500 bg-slate-800 scale-95 shadow-[0_0_15px_#f43f5e]';
    case 'purple': return 'border-purple-500 bg-slate-800 scale-95 shadow-[0_0_15px_#a855f7]';
    case 'yellow': return 'border-yellow-500 bg-slate-800 scale-95 shadow-[0_0_15px_#eab308]';
    case 'green': return 'border-green-500 bg-slate-800 scale-95 shadow-[0_0_15px_#22c55e]';
    case 'blue': return 'border-blue-500 bg-slate-800 scale-95 shadow-[0_0_15px_#3b82f6]';
    default: return 'border-slate-400 bg-slate-800 scale-95';
  }
};

const getDotClass = (colorName: string, isPlaying: boolean) => {
  if (!isPlaying) return 'bg-slate-700';
  switch (colorName) {
    case 'accent': return 'bg-accent shadow-[0_0_5px_#00f2ff]';
    case 'rose': return 'bg-rose-500 shadow-[0_0_5px_#f43f5e]';
    case 'purple': return 'bg-purple-500 shadow-[0_0_5px_#a855f7]';
    case 'yellow': return 'bg-yellow-500 shadow-[0_0_5px_#eab308]';
    case 'green': return 'bg-green-500 shadow-[0_0_5px_#22c55e]';
    case 'blue': return 'bg-blue-500 shadow-[0_0_5px_#3b82f6]';
    default: return 'bg-white';
  }
};

interface PadState {
  isPlaying: boolean;
  isLooping: boolean;
  volume: number;
  loopStart: number; // 0 to 1
  loopEnd: number; // 0 to 1
}

export function Sampler() {
  const [activePack, setActivePack] = useState<keyof typeof SAMPLE_PACKS>('Cyber FX');
  
  // Initialize pad states
  const [padStates, setPadStates] = useState<Record<number, PadState>>(() => {
    const initialStates: Record<number, PadState> = {};
    SAMPLE_PACKS['Cyber FX'].forEach(pad => {
      initialStates[pad.id] = { isPlaying: false, isLooping: pad.type === 'loop', volume: 0.8, loopStart: 0, loopEnd: 1 };
    });
    return initialStates;
  });
  
  // Store active audio nodes so we can stop them
  const activeNodes = useRef<Record<number, { osc: OscillatorNode, gain: GainNode, interval?: NodeJS.Timeout }>>({});

  const handlePackChange = (newPack: keyof typeof SAMPLE_PACKS) => {
    setActivePack(newPack);
    const newStates: Record<number, PadState> = {};
    SAMPLE_PACKS[newPack].forEach(pad => {
      newStates[pad.id] = { isPlaying: false, isLooping: pad.type === 'loop', volume: 0.8, loopStart: 0, loopEnd: 1 };
    });
    setPadStates(newStates);
    
    // Stop all active audio
    Object.values(activeNodes.current).forEach(({ osc, gain, interval }) => {
      try { osc.stop(); } catch (e) {}
      try { gain.disconnect(); } catch (e) {}
      if (interval) clearInterval(interval);
    });
    activeNodes.current = {};
  };

  const stopAudio = useCallback((id: number) => {
    if (activeNodes.current[id]) {
      try {
        activeNodes.current[id].osc.stop();
        activeNodes.current[id].gain.disconnect();
      } catch (e) {}
      if (activeNodes.current[id].interval) {
        clearInterval(activeNodes.current[id].interval);
      }
      delete activeNodes.current[id];
    }
  }, []);

  const playAudio = useCallback((id: number, pad: any, state: PadState) => {
    stopAudio(id); // Stop existing if any
    
    try {
      const engine = AudioEngine.getInstance();
      engine.resume();
      const ctx = engine.context;
      
      const playOscillator = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        const baseVol = state.volume;
        
        // Simple synthesis based on pad name
        if (pad.name === 'Kick' || pad.name === 'Impact' || pad.name === 'Sub Drop') {
          osc.frequency.setValueAtTime(pad.freq, now);
          osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
          gain.gain.setValueAtTime(baseVol, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        } else if (pad.name === 'Hat' || pad.name === 'Ride' || pad.name === 'Crash') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(pad.freq, now);
          gain.gain.setValueAtTime(baseVol * 0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        } else if (pad.name === 'Laser' || pad.name === 'Sweep') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(pad.freq, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
          gain.gain.setValueAtTime(baseVol * 0.5, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        } else {
          // Default synth
          osc.type = 'sine';
          osc.frequency.setValueAtTime(pad.freq, now);
          gain.gain.setValueAtTime(baseVol * 0.5, now);
          if (!state.isLooping) {
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          }
        }
        
        osc.start(now);
        
        if (!state.isLooping) {
          osc.stop(now + 0.5);
        }
        
        return { osc, gain };
      };

      const { osc, gain } = playOscillator();
      
      let interval: NodeJS.Timeout | undefined;

      if (state.isLooping) {
        // Simulate looping by re-triggering the oscillator based on loop points
        // Let's say a full loop is 1 second.
        const loopDurationMs = 1000;
        const startMs = state.loopStart * loopDurationMs;
        const endMs = state.loopEnd * loopDurationMs;
        const durationMs = Math.max(50, endMs - startMs);

        interval = setInterval(() => {
          // Stop current
          if (activeNodes.current[id]) {
            try { activeNodes.current[id].osc.stop(); } catch(e) {}
          }
          // Play new
          const newNodes = playOscillator();
          if (activeNodes.current[id]) {
            activeNodes.current[id].osc = newNodes.osc;
            activeNodes.current[id].gain = newNodes.gain;
          }
        }, durationMs);
      }
      
      activeNodes.current[id] = { osc, gain, interval };
      
      // Auto-release state if not looping
      if (!state.isLooping) {
        setTimeout(() => {
          setPadStates(prev => ({
            ...prev,
            [id]: { ...prev[id], isPlaying: false }
          }));
          delete activeNodes.current[id];
        }, 500);
      }
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  }, [stopAudio]);

  const handlePlay = useCallback((id: number, pad: any) => {
    setPadStates(prev => {
      const state = prev[id] || { isPlaying: false, isLooping: pad.type === 'loop', volume: 0.8, loopStart: 0, loopEnd: 1 };
      const newIsPlaying = !state.isPlaying;
      
      if (newIsPlaying) {
        playAudio(id, pad, { ...state, isPlaying: newIsPlaying });
      } else {
        stopAudio(id);
      }
      
      return { ...prev, [id]: { ...state, isPlaying: newIsPlaying } };
    });
  }, [playAudio, stopAudio]);

  const handleCue = useCallback((id: number, pad: any) => {
    // Cue resets playback and plays from start
    stopAudio(id);
    setPadStates(prev => {
      const state = prev[id];
      playAudio(id, pad, { ...state, isPlaying: true });
      return {
        ...prev,
        [id]: { ...state, isPlaying: true }
      };
    });
  }, [playAudio, stopAudio]);

  const handleLoopToggle = useCallback((id: number) => {
    setPadStates(prev => {
      const state = prev[id];
      if (!state) return prev;
      return { ...prev, [id]: { ...state, isLooping: !state.isLooping } };
    });
  }, []);

  const handleVolumeChange = useCallback((id: number, volume: number) => {
    setPadStates(prev => {
      const state = prev[id];
      if (!state) return prev;
      
      // Update active node volume immediately
      if (activeNodes.current[id] && activeNodes.current[id].gain) {
        activeNodes.current[id].gain.gain.setTargetAtTime(
          volume, 
          AudioEngine.getInstance().context.currentTime, 
          0.05
        );
      }
      
      return { ...prev, [id]: { ...state, volume } };
    });
  }, []);

  const handleLoopPointChange = useCallback((id: number, type: 'start' | 'end', value: number) => {
    setPadStates(prev => {
      const state = prev[id];
      if (!state) return prev;
      
      let newStart = state.loopStart;
      let newEnd = state.loopEnd;
      
      if (type === 'start') {
        newStart = Math.min(value, newEnd - 0.1); // Ensure start is before end
      } else {
        newEnd = Math.max(value, newStart + 0.1); // Ensure end is after start
      }
      
      return { ...prev, [id]: { ...state, loopStart: newStart, loopEnd: newEnd } };
    });
  }, []);

  return (
    <div className="p-6 flex flex-col gap-6 h-full">
      <div className="flex justify-between items-center">
        <h3 className="text-accent font-bold text-sm uppercase tracking-widest">Performance Sampler</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Pack</span>
          <select 
            className="bg-slate-900 border-slate-800 rounded-lg py-1.5 px-3 text-xs focus:ring-accent focus:border-accent text-slate-300 cursor-pointer font-bold"
            value={activePack}
            onChange={(e) => handlePackChange(e.target.value as keyof typeof SAMPLE_PACKS)}
          >
            {Object.keys(SAMPLE_PACKS).map(pack => (
              <option key={pack} value={pack}>{pack}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4 flex-1">
        {SAMPLE_PACKS[activePack].map(pad => {
          const state = padStates[pad.id] || { isPlaying: false, isLooping: pad.type === 'loop', volume: 0.8, loopStart: 0, loopEnd: 1 };
          const isPlaying = state.isPlaying;
          const isLooping = state.isLooping;
          
          return (
            <div
              key={pad.id}
              className={clsx(
                "relative rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-75 overflow-hidden min-h-[100px] group",
                getColorClasses(pad.color, isPlaying)
              )}
            >
              <VolumeKnob value={state.volume} onChange={(val) => handleVolumeChange(pad.id, val)} />

              {/* Main Pad Area (Clickable) */}
              <div 
                className="absolute inset-0 cursor-pointer z-0"
                onMouseDown={() => handlePlay(pad.id, pad)}
              />
              
              <div className="flex items-center gap-2 z-10 pointer-events-none mb-4">
                <div className={clsx(
                  "w-2 h-2 rounded-full",
                  getDotClass(pad.color, isPlaying)
                )}></div>
                <span className={clsx(
                  "text-sm font-bold uppercase tracking-wider",
                  isPlaying ? "text-white" : "text-slate-400"
                )}>{pad.name}</span>
              </div>
              
              {/* Loop Points Slider */}
              {isLooping && (
                <div className="absolute top-2 left-2 right-8 h-2 bg-slate-900/80 rounded-full z-30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center px-1">
                  <input 
                    type="range" 
                    min="0" max="1" step="0.01" 
                    value={state.loopStart} 
                    onChange={(e) => handleLoopPointChange(pad.id, 'start', parseFloat(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-40"
                    title="Loop Start"
                  />
                  <input 
                    type="range" 
                    min="0" max="1" step="0.01" 
                    value={state.loopEnd} 
                    onChange={(e) => handleLoopPointChange(pad.id, 'end', parseFloat(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-40"
                    title="Loop End"
                  />
                  {/* Visual representation of loop points */}
                  <div className="relative w-full h-1 bg-slate-700 rounded-full pointer-events-none">
                    <div 
                      className="absolute h-full bg-accent rounded-full"
                      style={{ 
                        left: `${state.loopStart * 100}%`, 
                        width: `${(state.loopEnd - state.loopStart) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Playback Controls */}
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity px-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); handlePlay(pad.id, pad); }}
                  className={clsx(
                    "p-1.5 rounded-md hover:bg-slate-700 transition-colors",
                    isPlaying ? "bg-accent/20 text-accent" : "bg-slate-800 text-slate-400"
                  )}
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCue(pad.id, pad); }}
                  className="p-1.5 bg-slate-800 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
                  title="Cue (Restart)"
                >
                  <RotateCcw size={12} />
                </button>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); handleLoopToggle(pad.id); }}
                  className={clsx(
                    "p-1.5 rounded-md hover:bg-slate-700 transition-colors flex items-center justify-center",
                    isLooping ? "bg-accent/20 text-accent" : "bg-slate-800 text-slate-400"
                  )}
                  title="Toggle Loop"
                >
                  <Repeat size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
