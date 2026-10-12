"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { formatPoints } from "@/lib/points";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  try {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  } catch {
    return () => {};
  }
}

function getSnapshot() {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** True when the viewer asked for less motion; every animation collapses to its end state. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * A number that counts up from `from` to `to`. It writes the digits straight
 * into its own text node from a rAF loop, so the counting never re-renders
 * React, and it reserves the final width up front so the row does not
 * shuffle while digits are added. Decorative: `aria-hidden`, and callers set
 * the real value in sr-only text beside it.
 */
export function CountUp({
  to,
  from = 0,
  delay = 0,
  duration = 1100,
  reduced,
  className = "",
}: {
  to: number;
  from?: number;
  delay?: number;
  duration?: number;
  reduced: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || from === to) {
      el.textContent = formatPoints(to);
      return;
    }
    el.textContent = formatPoints(from);
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatPoints(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = formatPoints(to);
    };
  }, [to, from, delay, duration, reduced]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`inline-block text-right tabular-nums ${className}`}
      style={{ minWidth: `${formatPoints(to).length}ch` }}
    />
  );
}

/**
 * An element's centre in layout coordinates — the offset chain, which ignores
 * CSS transforms. That matters here: the entrance animations are transforms
 * already running when the climb is measured, and a bounding rect would
 * measure where they happen to be mid-flight rather than where the slot is.
 */
export function layoutCenter(el: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 };
}
