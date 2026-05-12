import { useCallback, useEffect, useRef } from "react";

// Generate a short notification beep using Web Audio API
function createNotificationSound(): () => void {
  return () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
      oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.08); // C#6
      oscillator.type = "sine";

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.25);

      // Cleanup
      setTimeout(() => ctx.close(), 500);
    } catch {
      // Audio not supported – silent fallback
    }
  };
}

/**
 * Returns a `play` function that emits a notification beep.
 * Pass `enabled` to gate the sound — uses a ref internally so
 * the callback never captures a stale value.
 */
export function useNotificationSound(enabled = true) {
  const playFn = useRef(createNotificationSound());
  // Keep enabled state in a ref to avoid stale closures
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const play = useCallback(() => {
    if (enabledRef.current) {
      playFn.current();
    }
  }, []);

  return { play };
}

