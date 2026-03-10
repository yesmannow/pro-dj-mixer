import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '@/lib/audioEngine';
import { useUIStore } from '@/store/uiStore';

interface PerformanceKeyOptions {
  deckId: 'A' | 'B';
  getCueTime: (slot: number) => number | null;
  startStutter: (time: number) => void;
  stopStutter: (time: number) => void;
  clearCue: (slot: number) => void | Promise<void>;
}

const deckKeyMap: Record<'A' | 'B', string[]> = {
  A: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'],
  B: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'],
};

export function usePerformanceKeys({ deckId, getCueTime, startStutter, stopStutter, clearCue }: PerformanceKeyOptions) {
  const [pressedSlots, setPressedSlots] = useState<Set<number>>(new Set());
  const isShiftHeld = useUIStore((state) => state.isShiftHeld);
  const optionsRef = useRef({ getCueTime, startStutter, stopStutter, clearCue });
  const shiftHeldRef = useRef(isShiftHeld);

  useEffect(() => {
    optionsRef.current = { getCueTime, startStutter, stopStutter, clearCue };
  }, [getCueTime, startStutter, stopStutter, clearCue]);

  useEffect(() => {
    shiftHeldRef.current = isShiftHeld;
  }, [isShiftHeld]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const engaged = new Set<number>();
    const { setShiftHeld: setShiftHeldGlobal } = useUIStore.getState();
    const getIsShiftHeld = () => useUIStore.getState().isShiftHeld;
    const audioEngine = AudioEngine.getInstance();

    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isFormField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isFormField || e.repeat) return;

      if (e.key === 'Shift' && !shiftHeldRef.current) {
        shiftHeldRef.current = true;
        if (!getIsShiftHeld()) {
          setShiftHeldGlobal(true);
        }
        return;
      }

      const mapping = deckKeyMap[deckId];
      const slotIndex = mapping.indexOf(e.code);
      if (slotIndex === -1) return;

      if (shiftHeldRef.current) {
        void optionsRef.current.clearCue(slotIndex);
        return;
      }

      const cueTime = optionsRef.current.getCueTime(slotIndex);
      if (cueTime === null) return;

      audioEngine.resume().catch(() => {
        // Ignore resume failures here; the deck load path will surface actionable errors.
      });
      optionsRef.current.startStutter(cueTime);
      engaged.add(slotIndex);
      setPressedSlots((prev) => {
        if (prev.has(slotIndex)) return prev;
        const next = new Set(prev);
        next.add(slotIndex);
        return next;
      });
    };

    const keyup = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        if (shiftHeldRef.current) {
          shiftHeldRef.current = false;
          if (getIsShiftHeld()) {
            setShiftHeldGlobal(false);
          }
        }
        return;
      }

      const mapping = deckKeyMap[deckId];
      const slotIndex = mapping.indexOf(e.code);
      if (slotIndex === -1 || !engaged.has(slotIndex)) return;

      engaged.delete(slotIndex);
      const cueTime = optionsRef.current.getCueTime(slotIndex);
      if (cueTime === null) return;

      optionsRef.current.stopStutter(cueTime);
      setPressedSlots((prev) => {
        if (!prev.has(slotIndex)) return prev;
        const next = new Set(prev);
        next.delete(slotIndex);
        return next;
      });
    };

    window.addEventListener('keydown', keydown, { passive: true });
    window.addEventListener('keyup', keyup, { passive: true });

    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [deckId]);

  return { shiftHeld: isShiftHeld, pressedSlots };
}
