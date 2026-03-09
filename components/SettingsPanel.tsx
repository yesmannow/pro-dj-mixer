'use client';

import { Settings, X, Moon, Sun, Zap, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore } from '@/store/uiStore';
import { motion, AnimatePresence } from 'motion/react';

const ACCENT_COLORS = [
  { name: 'Gold', value: '#D4AF37' },
  { name: 'Crimson', value: '#E11D48' },
  { name: 'Bronze', value: '#A97142' },
  { name: 'Onyx', value: '#1A1610' },
];

export function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { accentColor, setAccentColor, autoPlayOnHotCue, setAutoPlayOnHotCue } = useUIStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-studio-black border border-studio-gold/20 rounded-2xl shadow-2xl z-[101] overflow-hidden"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-bold text-white tracking-tight">Settings</h2>
              </div>
              <button
                onClick={onClose}
                    className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            <div className="p-6 flex flex-col gap-8">
              {/* Accent Color */}
              <div className="flex flex-col gap-4">
                <label className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                  Accent Color
                </label>
                <div className="flex gap-3">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setAccentColor(color.value)}
                      className={clsx(
                        "w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center",
                        accentColor === color.value 
                          ? "border-white scale-110 shadow-[0_0_10px_currentColor]" 
                          : "border-transparent hover:scale-105"
                      )}
                      style={{ backgroundColor: color.value, color: color.value }}
                      title={color.name}
                    >
                      {accentColor === color.value && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Behavior */}
              <div className="flex flex-col gap-4">
                <label className="text-xs uppercase tracking-widest text-slate-500 font-bold">
                  Deck Behavior
                </label>
                <div className="flex items-center justify-between p-4 bg-studio-slate/60 rounded-xl border border-studio-gold/15">
                  <div className="flex items-center gap-3">
                    <Zap className="w-4 h-4 text-accent" />
                    <div>
                      <div className="text-sm font-medium text-slate-200">Auto-play on Hot Cue</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Start playback automatically when jumping to a cue point</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoPlayOnHotCue(!autoPlayOnHotCue)}
                    className={clsx(
                      "w-10 h-5 rounded-full transition-colors relative",
                      autoPlayOnHotCue ? "bg-accent" : "bg-slate-700"
                    )}
                  >
                    <div className={clsx(
                      "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                      autoPlayOnHotCue ? "left-6" : "left-1"
                    )} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-studio-black/80 border-t border-studio-gold/20 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-accent text-slate-950 font-bold rounded-lg hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_15px_rgba(212,175,55,0.35)]"
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
