import { useCallback, useEffect, useRef, useState } from 'react';
import type { Phase } from '../types';

/** Roulette timings, verbatim from the prototype. */
const SPIN_TICK_MS = 70;
const SPIN_DURATION_MS = 1200;
const SETTLE_MS = 1100;

/**
 * Transient roulette state for a single draw. Deliberately kept out of the
 * persisted store: a reload should never resume mid-spin.
 */
export function useRoll(laneCount: number) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [rollNo, setRollNo] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);

  const timers = useRef<{ spin?: number; land?: number; settle?: number }>({});
  const laneCountRef = useRef(laneCount);
  laneCountRef.current = laneCount;

  const clearTimers = useCallback(() => {
    const t = timers.current;
    if (t.spin !== undefined) clearInterval(t.spin);
    if (t.land !== undefined) clearTimeout(t.land);
    if (t.settle !== undefined) clearTimeout(t.settle);
    timers.current = {};
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** Spin, land on `targetLane`, then hand control back after the settle beat. */
  const start = useCallback(
    (memberId: string, targetLane: number, commit: () => void) => {
      clearTimers();
      setActiveId(memberId);
      setPhase('rolling');

      timers.current.spin = window.setInterval(() => {
        setRollNo(1 + Math.floor(Math.random() * Math.max(1, laneCountRef.current)));
      }, SPIN_TICK_MS);

      timers.current.land = window.setTimeout(() => {
        if (timers.current.spin !== undefined) clearInterval(timers.current.spin);
        timers.current.spin = undefined;
        setRollNo(targetLane);
        setPhase('landed');
        commit();
        timers.current.settle = window.setTimeout(() => setPhase('idle'), SETTLE_MS);
      }, SPIN_DURATION_MS);
    },
    [clearTimers],
  );

  const reset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setRollNo(1);
    setActiveId(null);
  }, [clearTimers]);

  return { phase, rollNo, activeId, start, reset };
}
