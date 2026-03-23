'use client';

import { useState } from 'react';
import { X, Check, ChevronRight, Settings2, Activity, Music2, Sliders, Palette, Zap, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore } from '@/store/uiStore';
import type { CrossfaderCurve, WaveformStyle, BpmDisplayMode, LibraryLayout } from '@/store/uiStore';
import { motion, AnimatePresence } from 'motion/react';
import { useMixerStore } from '@/store/mixerStore';

// ── Shared sub-components ─────────────────────────────────────────────────────
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-yellow-400/80 w-4 h-4 flex-shrink-0">{icon}</span>
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{title}</h3>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-white/80">{label}</div>
        {description && <div className="text-[10px] text-white/30 mt-0.5 leading-snug">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={clsx(
        'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
        value ? 'bg-yellow-500' : 'bg-white/10'
      )}
    >
      <div className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200', value ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function PillGroup<T extends string>({
  options, value, onChange,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center rounded-lg overflow-hidden border border-white/10 bg-black/30">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={clsx(
            'flex-1 py-1 px-2 text-[10px] font-black uppercase tracking-wider transition-colors',
            value === opt.value ? 'bg-yellow-500 text-black' : 'text-white/35 hover:text-white'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ColorSwatch({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx('w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all', active ? 'border-white scale-110' : 'border-transparent hover:scale-105')}
      style={{ backgroundColor: color }}
    >
      {active && <Check className="w-4 h-4 text-white drop-shadow" />}
    </button>
  );
}

function Slider({ value, min, max, step, onChange, unit }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 accent-yellow-400"
      />
      <span className="text-[10px] font-mono text-white/40 w-10 text-right">{value}{unit ?? ''}</span>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'decks' | 'mixer' | 'waveform' | 'library' | 'display' | 'appearance';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'decks',      label: 'Decks',      icon: <Settings2 className="w-3.5 h-3.5" /> },
  { id: 'mixer',      label: 'Mixer',      icon: <Sliders className="w-3.5 h-3.5" /> },
  { id: 'waveform',   label: 'Waveform',   icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'library',    label: 'Library',    icon: <Music2 className="w-3.5 h-3.5" /> },
  { id: 'display',    label: 'Display',    icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-3.5 h-3.5" /> },
];

const ACCENT_COLORS = [
  { name: 'Gold',     value: '#D4AF37' },
  { name: 'Crimson',  value: '#E11D48' },
  { name: 'Cyan',     value: '#06B6D4' },
  { name: 'Violet',   value: '#8B5CF6' },
  { name: 'Emerald',  value: '#10B981' },
  { name: 'Orange',   value: '#F97316' },
  { name: 'Rose',     value: '#FB7185' },
  { name: 'White',    value: '#F8FAFC' },
];

const PITCH_RANGES: { value: 4 | 6 | 8 | 16 | 100; label: string }[] = [
  { value: 4,   label: '±4%'  },
  { value: 6,   label: '±6%'  },
  { value: 8,   label: '±8%'  },
  { value: 16,  label: '±16%' },
  { value: 100, label: 'Full' },
];

// ── Main SettingsPanel ────────────────────────────────────────────────────────
export function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('decks');

  const {
    accentColor, setAccentColor,
    defaultVinylMode, setDefaultVinylMode,
    defaultQuantize, setDefaultQuantize,
    defaultSlipMode, setDefaultSlipMode,
    pitchRange, setPitchRange,
    autoPlayOnHotCue, setAutoPlayOnHotCue,
    crossfaderCurve, setCrossfaderCurve,
    masterLimiter, setMasterLimiter,
    waveformZoom, setWaveformZoom,
    waveformStyle, setWaveformStyle,
    showWaveformBeats, setShowWaveformBeats,
    bpmDisplayMode, setBpmDisplayMode,
    showKeyInCamelot, setShowKeyInCamelot,
    showEnergyBadge, setShowEnergyBadge,
    libraryLayout, setLibraryLayout,
    isSmartMatchEnabled, toggleSmartMatch,
  } = useUIStore();

  const { crossfaderCurve: storeCurve, setCrossfaderCurve: storeSetCurve } = useMixerStore();

  // Keep both stores in sync for crossfader curve
  const handleCrossfaderCurve = (curve: CrossfaderCurve) => {
    setCrossfaderCurve(curve);
    storeSetCurve(curve);
  };

  const resetToDefaults = () => {
    setDefaultVinylMode(true);
    setDefaultQuantize(true);
    setDefaultSlipMode(false);
    setPitchRange(8);
    setAutoPlayOnHotCue(true);
    setCrossfaderCurve('blend');
    storeSetCurve('blend');
    setMasterLimiter(true);
    setWaveformZoom(80);
    setWaveformStyle('bars');
    setShowWaveformBeats(true);
    setBpmDisplayMode('decimal');
    setShowKeyInCamelot(true);
    setShowEnergyBadge(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[199]"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[88vh] flex flex-col bg-[#090910] border border-white/10 rounded-2xl shadow-[0_40px_80px_rgba(0,0,0,0.8)] z-[200] overflow-hidden"
            style={{ boxShadow: `0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(${accentColor === '#D4AF37' ? '212,175,55' : '255,255,255'},0.12)` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Settings2 className="w-4 h-4 text-yellow-400" />
                <h2 className="text-base font-black text-white tracking-tight">Settings</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold text-white/30 border border-white/10 hover:text-white hover:border-white/30 transition-all"
                  title="Reset all settings to defaults"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
                <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-0.5 px-3 py-2 border-b border-white/5 overflow-x-auto no-scrollbar flex-shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0',
                    activeTab === tab.id
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                      : 'text-white/30 hover:text-white/70 border border-transparent'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {/* ── DECKS ─────────────────────────────────────────────── */}
              {activeTab === 'decks' && (
                <div>
                  <SectionTitle icon={<Settings2 className="w-full h-full" />} title="Deck Defaults" />
                  <div className="space-y-0">
                    <Row label="Default Jog Mode" description="Scratch the waveform or nudge playback speed">
                      <PillGroup
                        value={defaultVinylMode ? 'vinyl' : 'nudge'}
                        onChange={(v) => setDefaultVinylMode(v === 'vinyl')}
                        options={[{ value: 'vinyl', label: 'Vinyl' }, { value: 'nudge', label: 'Nudge' }]}
                      />
                    </Row>
                    <Row label="Default Quantize" description="Snap loops and cue points to the beat grid">
                      <Toggle value={defaultQuantize} onChange={setDefaultQuantize} />
                    </Row>
                    <Row label="Default Slip Mode" description="Position continues under loops and cues">
                      <Toggle value={defaultSlipMode} onChange={setDefaultSlipMode} />
                    </Row>
                    <Row label="Auto-play on Hot Cue" description="Resume playback when jumping to a cue">
                      <Toggle value={autoPlayOnHotCue} onChange={setAutoPlayOnHotCue} />
                    </Row>
                    <Row label="Pitch Fader Range" description="Maximum ±% range of the pitch fader">
                      <PillGroup
                        value={String(pitchRange) as string}
                        onChange={(v) => setPitchRange(Number(v) as 4 | 6 | 8 | 16 | 100)}
                        options={PITCH_RANGES.map(r => ({ value: String(r.value), label: r.label }))}
                      />
                    </Row>
                  </div>
                </div>
              )}

              {/* ── MIXER ─────────────────────────────────────────────── */}
              {activeTab === 'mixer' && (
                <div>
                  <SectionTitle icon={<Sliders className="w-full h-full" />} title="Mixer" />
                  <div className="space-y-0">
                    <Row label="Crossfader Curve" description="How the crossfader blends between decks">
                      <PillGroup<CrossfaderCurve>
                        value={crossfaderCurve}
                        onChange={handleCrossfaderCurve}
                        options={[
                          { value: 'blend', label: 'Blend' },
                          { value: 'cut',   label: 'Cut'   },
                          { value: 'neural', label: 'AI'  },
                        ]}
                      />
                    </Row>
                    <Row label="Master Limiter" description="Software brick-wall limiter on master output">
                      <Toggle value={masterLimiter} onChange={setMasterLimiter} />
                    </Row>
                  </div>

                  <div className="mt-6">
                    <SectionTitle icon={<Sliders className="w-full h-full" />} title="Crossfader Curve Info" />
                    <div className="rounded-xl bg-white/4 border border-white/8 p-4 space-y-2">
                      {[
                        { name: 'Blend', desc: 'Smooth linear crossfade — ideal for house and progressive.' },
                        { name: 'Cut',   desc: 'Hard cut (hamster-style) — ideal for hip-hop scratch sets.' },
                        { name: 'AI',    desc: 'Adaptive curve learns from your mixing style over time.' },
                      ].map(c => (
                        <div key={c.name} className="flex items-start gap-2">
                          <ChevronRight className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-[11px] font-bold text-white/70">{c.name}</span>
                            <span className="text-[10px] text-white/30 ml-1.5">{c.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── WAVEFORM ──────────────────────────────────────────── */}
              {activeTab === 'waveform' && (
                <div>
                  <SectionTitle icon={<Activity className="w-full h-full" />} title="Waveform Display" />
                  <div className="space-y-0">
                    <Row label="Zoom Level" description="Horizontal zoom of the waveform display">
                      <Slider value={waveformZoom} min={20} max={200} step={5} onChange={setWaveformZoom} unit="%" />
                    </Row>
                    <Row label="Waveform Style" description="Visual rendering style">
                      <PillGroup<WaveformStyle>
                        value={waveformStyle}
                        onChange={setWaveformStyle}
                        options={[
                          { value: 'bars',   label: 'Bars'   },
                          { value: 'line',   label: 'Line'   },
                          { value: 'mirror', label: 'Mirror' },
                        ]}
                      />
                    </Row>
                    <Row label="Beat Grid Overlay" description="Draw beat markers on the waveform">
                      <Toggle value={showWaveformBeats} onChange={setShowWaveformBeats} />
                    </Row>
                  </div>
                </div>
              )}

              {/* ── LIBRARY ───────────────────────────────────────────── */}
              {activeTab === 'library' && (
                <div>
                  <SectionTitle icon={<Music2 className="w-full h-full" />} title="Library" />
                  <div className="space-y-0">
                    <Row label="Smart Match" description="Filter library to harmonically compatible tracks">
                      <Toggle value={isSmartMatchEnabled} onChange={toggleSmartMatch} />
                    </Row>
                    <Row label="Library Layout" description="Default view mode for the track list">
                      <PillGroup<LibraryLayout>
                        value={libraryLayout}
                        onChange={setLibraryLayout}
                        options={[
                          { value: 'list',    label: 'List'    },
                          { value: 'grid',    label: 'Grid'    },
                          { value: 'compact', label: 'Compact' },
                        ]}
                      />
                    </Row>
                  </div>
                </div>
              )}

              {/* ── DISPLAY ───────────────────────────────────────────── */}
              {activeTab === 'display' && (
                <div>
                  <SectionTitle icon={<Zap className="w-full h-full" />} title="Display" />
                  <div className="space-y-0">
                    <Row label="BPM Format" description="How BPM is displayed in decks and library">
                      <PillGroup<BpmDisplayMode>
                        value={bpmDisplayMode}
                        onChange={setBpmDisplayMode}
                        options={[
                          { value: 'integer', label: '128'       },
                          { value: 'decimal', label: '128.0'     },
                          { value: 'both',    label: '128 / 128.0' },
                        ]}
                      />
                    </Row>
                    <Row label="Key Display" description="Show keys in Camelot notation (8A) or standard (Am)">
                      <Toggle value={showKeyInCamelot} onChange={setShowKeyInCamelot} />
                    </Row>
                    <Row label="Energy Badge" description="Show energy level tag (Low/Medium/High/Peak) in library">
                      <Toggle value={showEnergyBadge} onChange={setShowEnergyBadge} />
                    </Row>
                  </div>
                </div>
              )}

              {/* ── APPEARANCE ────────────────────────────────────────── */}
              {activeTab === 'appearance' && (
                <div>
                  <SectionTitle icon={<Palette className="w-full h-full" />} title="Accent Color" />
                  <div className="flex flex-wrap gap-3 mb-6">
                    {ACCENT_COLORS.map((c) => (
                      <ColorSwatch key={c.value} color={c.value} label={c.name} active={accentColor === c.value} onClick={() => setAccentColor(c.value)} />
                    ))}
                  </div>

                  {/* Custom hex input */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/8">
                    <div className="w-8 h-8 rounded-full border border-white/15 flex-shrink-0" style={{ background: accentColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-white/40 mb-1">Custom hex</div>
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setAccentColor(e.target.value); }}
                        className="w-full bg-transparent text-[12px] font-mono text-white/80 focus:outline-none"
                        maxLength={7}
                      />
                    </div>
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/8 bg-black/30 flex-shrink-0">
              <p className="text-[10px] text-white/20">Settings save automatically</p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-full text-black text-sm font-black transition-all hover:brightness-110 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 0 16px ${accentColor}50` }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
