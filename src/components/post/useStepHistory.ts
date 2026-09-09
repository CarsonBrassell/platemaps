"use client";

import { useEffect, useRef } from "react";

/** What a step writes into the history entry, alongside whatever the router keeps there. */
type StepState = Record<string, unknown> & { __pmStep?: number; __pmDepth?: number };

/**
 * A composer step is a history entry, so back goes back a step.
 *
 * The five steps lived in a `useState` index and nowhere else, which meant the
 * browser only ever knew about one screen: the phone's back gesture, the
 * WebView's edge swipe and a desktop back button all popped the *composer*, and
 * took the photo, the restaurant and the rating with it. Half way through
 * answering five questions, "back" means the previous question — nobody has
 * ever meant "throw all of this away" by it.
 *
 * So every forward step pushes an entry at the same URL carrying its own index,
 * and `popstate` reads that index back out. The entry the composer opened on is
 * the only one with no index of its own, and that is exactly the entry where
 * back *should* leave: there is no step behind the first one.
 *
 * Backwards is never a bare `setIndex`. It asks the history to go back and lets
 * the pop apply the step, because moving the index without moving the history
 * leaves entries stacked behind the flow — and the next real back press then
 * lands on a step already left, which reads as a dead button.
 *
 * `__pmDepth` climbs with it so `PhoneSwipeBack` counts steps as the screens
 * they now are; without that, a composer opened as the app's first screen holds
 * its edge swipe back on every step of the flow.
 *
 * @param index the step showing now
 * @param apply moves the flow to a step — called for a pop as well as a push
 * @returns the only way the flow should change step
 */
export function useStepHistory(index: number, apply: (next: number) => void) {
  /* Read through a ref so the pop handler, which is registered once, still
     calls the current render's closure and sees the current index. Assigned in
     an effect rather than in the body: a ref written during a render is a
     render with a side effect, which React is entitled to throw away and run
     again. */
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  /** Entries of our own behind this one — never trust `history.length` for it. */
  const pushed = useRef(0);

  useEffect(() => {
    const state = window.history.state as StepState | null;
    if (typeof state?.__pmStep !== "number") {
      // Merged, never replaced: the App Router keeps its own cache key in here.
      window.history.replaceState({ ...state, __pmStep: 0 }, "");
    }

    function onPop(e: PopStateEvent) {
      const popped = e.state as StepState | null;
      /* No step on the entry means it belongs to whatever was open before the
         composer. That back leaves the flow, which is what it should do, and
         the router owns it from here. */
      if (typeof popped?.__pmStep !== "number") return;
      pushed.current = Math.max(0, popped.__pmStep);
      applyRef.current(popped.__pmStep);
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return function go(next: number) {
    if (next === index) return;

    if (next < index) {
      /* Only as far back as entries we actually pushed. If the two ever
         disagree, move the step by hand rather than run a `go` that would walk
         off the front of the flow and out of the app. */
      if (pushed.current >= index - next) {
        window.history.go(next - index);
        return;
      }
      applyRef.current(next);
      return;
    }

    const state = window.history.state as StepState | null;
    const depth = typeof state?.__pmDepth === "number" ? state.__pmDepth : 0;
    window.history.pushState({ ...state, __pmDepth: depth + 1, __pmStep: next }, "");
    pushed.current += 1;
    applyRef.current(next);
  };
}
