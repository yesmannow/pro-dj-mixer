'use client';

import { useCallback } from 'react';

const pads = [
  { name: 'Kick', color: 'bg-red-500' },
  { name: 'Snare', color: 'bg-blue-500' },
  { name: 'Clap', color: 'bg-green-500' },
  { name: 'Airhorn', color: 'bg-yellow-500' },
  { name: 'FX1', color: 'bg-purple-500' },
  { name: 'FX2', color: 'bg-pink-500' },
];

export function Sampler() {
  const playSound = useCallback((type: string) => {
    const audioContext = new (globalThis.window.AudioContext || (globalThis.window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    switch (type) {
      case 'Kick': {
        oscillator.frequency.setValueAtTime(60, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
        break;
      }
      case 'Snare': {
        // White noise burst
        const bufferSize = audioContext.sampleRate * 0.1;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = audioContext.createBufferSource();
        whiteNoise.buffer = buffer;
        whiteNoise.connect(gainNode);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        whiteNoise.start();
        break;
      }
      case 'Clap': {
        // Similar to snare but shorter
        const clapBufferSize = audioContext.sampleRate * 0.05;
        const clapBuffer = audioContext.createBuffer(1, clapBufferSize, audioContext.sampleRate);
        const clapOutput = clapBuffer.getChannelData(0);
        for (let i = 0; i < clapBufferSize; i++) {
          clapOutput[i] = Math.random() * 2 - 1;
        }
        const clapNoise = audioContext.createBufferSource();
        clapNoise.buffer = clapBuffer;
        clapNoise.connect(gainNode);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
        clapNoise.start();
        break;
      }
      case 'Airhorn': {
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
        break;
      }
      case 'FX1': {
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      }
      case 'FX2': {
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioContext.currentTime + 0.4);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.4);
        break;
      }
    }
  }, []);

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl rounded-xl border border-white/5 p-4 shadow-2xl">
      <h3 className="text-sm font-bold text-white tracking-tight mb-4">SAMPLER</h3>
      <div className="grid grid-cols-2 grid-rows-3 gap-2">
        {pads.map((pad) => (
          <button
            key={pad.name}
            className={`h-16 ${pad.color} rounded-lg border border-white/10 flex items-center justify-center text-white font-bold text-sm hover:brightness-110 active:scale-95 transition-all`}
            onClick={() => playSound(pad.name)}
          >
            {pad.name}
          </button>
        ))}
      </div>
    </div>
  );
}
