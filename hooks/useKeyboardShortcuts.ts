'use client';

import { useEffect } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { AudioEngine } from '@/lib/audioEngine';

/**
 * Global keyboard shortcuts for DJ performance:
 * - Space = Play/Pause active deck (Deck A priority)
 * - Q/W = Nudge Deck A (slow down / speed up)
 * - O/P = Nudge Deck B (slow down / speed up)
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const NUDGE_AMOUNT = 0.5; // percent

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isFormField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (isFormField || e.repeat) return;

      const store = useDeckStore.getState();

      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          // Play/Pause: prefer Deck A if it has a track, otherwise Deck B
          if (store.deckA.track) {
            store.togglePlay('A');
          } else if (store.deckB.track) {
            store.togglePlay('B');
          }
          break;
        }

        // Q/W = Nudge Deck A
        case 'KeyQ': {
          e.preventDefault();
          AudioEngine.getInstance().resume().catch(() => {});
          store.setPitch('A', store.deckA.pitchPercent - NUDGE_AMOUNT);
          break;
        }
        case 'KeyW': {
          e.preventDefault();
          AudioEngine.getInstance().resume().catch(() => {});
          store.setPitch('A', store.deckA.pitchPercent + NUDGE_AMOUNT);
          break;
        }

        // O/P = Nudge Deck B
        case 'KeyO': {
          e.preventDefault();
          AudioEngine.getInstance().resume().catch(() => {});
          store.setPitch('B', store.deckB.pitchPercent - NUDGE_AMOUNT);
          break;
        }
        case 'KeyP': {
          e.preventDefault();
          AudioEngine.getInstance().resume().catch(() => {});
          store.setPitch('B', store.deckB.pitchPercent + NUDGE_AMOUNT);
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
