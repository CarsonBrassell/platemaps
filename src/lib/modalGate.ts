"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether a full-screen modal is up — so first-run furniture can wait its turn.
 *
 * Why: a brand-new phone account got the free-slice TicketPopup (auto-opens on
 * first feed load, z-50, covers the nav and the Post button) and the coach tour
 * (z-60, "Tap Feed") at the same moment. The tour pointed at controls hidden
 * under the popup, its caption sat over the popup's own buttons, and new users
 * reported they could not post (2026-11-18). The tour now defers while any
 * registered modal is open; its step lives in sessionStorage, so nothing is lost.
 */
let open = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Call from a modal component: counts as "up" for as long as it is mounted. */
export function useRegisterModal() {
  useEffect(() => {
    open += 1;
    emit();
    return () => {
      open -= 1;
      emit();
    };
  }, []);
}

/** True while any registered modal is mounted. Server render: false. */
export function useModalOpen() {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false
  );
}
