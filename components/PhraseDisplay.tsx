'use client';

interface PhraseDisplayProps {
  bpm: number;
  currentTime: number;
  label: string;
}

/**
 * Predictive Phrase Display: shows remaining bars in a 32-beat phrase.
 * Pulses red when 4 bars (16 beats) remain.
 */
export function PhraseDisplay({ bpm, currentTime, label }: Readonly<PhraseDisplayProps>) {
  if (!bpm || bpm <= 0) return null;

  const secondsPerBeat = 60 / bpm;
  const beatsPerPhrase = 32;
  const currentBeat = currentTime / secondsPerBeat;
  const beatInPhrase = currentBeat % beatsPerPhrase;
  const beatsRemaining = beatsPerPhrase - beatInPhrase;
  const barsRemaining = Math.ceil(beatsRemaining / 4);

  const isUrgent = barsRemaining <= 4;

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] font-bold tracking-wider transition-all ${
        isUrgent
          ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse shadow-[0_0_8px_rgba(255,0,0,0.3)]'
          : 'bg-white/5 text-slate-400 border border-white/10'
      }`}
    >
      <span className="text-[8px] opacity-60">{label}</span>
      <span>{barsRemaining} {barsRemaining === 1 ? 'BAR' : 'BARS'} TO DROP</span>
    </div>
  );
}
