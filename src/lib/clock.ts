/**
 * One shared minute clock for every component that needs the current time.
 *
 * Open/closed state is time-dependent and shown on every restaurant card, so
 * a per-component `setInterval` would mean the stats bar plus one timer per
 * card — dozens of timers ticking in lockstep to compute the same instant.
 * This exposes a single interval through `useSyncExternalStore`, which is also
 * the idiomatic way to read an external source during render without the
 * setState-inside-an-effect pattern.
 *
 * `getServerSnapshot` returns null so server-rendered (and statically
 * prerendered) output shows a neutral placeholder rather than baking in the
 * build time, which would be wrong within the hour.
 */

const TICK_MS = 60_000;

let current: Date | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  current = new Date();
  for (const listener of listeners) listener();
}

export function subscribeToClock(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    // First subscriber starts the clock. Setting `current` here rather than in
    // an effect is what keeps this out of the cascading-render pattern: React
    // re-reads the snapshot immediately after subscribing.
    current = new Date();
    timer = setInterval(tick, TICK_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Stable between ticks — returning a fresh Date here would loop forever. */
export function getClockSnapshot(): Date | null {
  return current;
}

export function getServerClockSnapshot(): Date | null {
  return null;
}
