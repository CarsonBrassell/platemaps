"use client";

import { useSyncExternalStore } from "react";
import { useDiscoverModesAccess } from "@/lib/auth";

/**
 * The For me and Nearby buttons on Discover (lib/forMeGate.ts says who gets them).
 *
 * Two independent toggles, so a small store rather than a URL: the discover GET is
 * CDN-cached and forwards every query key to the API, and a position never goes
 * in a URL. `picks` is the For me button, `near` is the Nearby button. Both live
 * here so the web and the phone read one state, and so the query hook can clear
 * them the moment a filter is applied (filters and toggles are never both on).
 *
 * Kept in sessionStorage so a reload in the same tab keeps the choice; only the two
 * booleans are stored, never a position. Every storage access is guarded, since a
 * private window throws.
 */
export type DiscoverModes = { picks: boolean; near: boolean };

const KEY = "pm.discover.modes.v1";
const OFF: DiscoverModes = { picks: false, near: false };

// Loaded on the first client read, not at import, so the server render never
// touches storage. The snapshot object only changes when a value does.
let current: DiscoverModes = OFF;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      if (typeof o.picks === "boolean" && typeof o.near === "boolean") {
        if (o.picks || o.near) current = { picks: o.picks, near: o.near };
      }
    }
  } catch {
    /* blocked storage or a bad value: both stay off */
  }
}

function save() {
  try {
    if (current.picks || current.near) {
      window.sessionStorage.setItem(KEY, JSON.stringify({ picks: current.picks, near: current.near }));
    } else {
      window.sessionStorage.removeItem(KEY);
    }
  } catch {
    /* the choice still holds for the page's life */
  }
}

function emit() {
  for (const l of listeners) l();
}

/** Change one or both toggles. A no-op (nobody is told) when nothing differs. */
export function setDiscoverModes(next: Partial<DiscoverModes>): void {
  load();
  const picks = next.picks ?? current.picks;
  const near = next.near ?? current.near;
  if (picks === current.picks && near === current.near) return;
  current = picks || near ? { picks, near } : OFF;
  save();
  emit();
}

/** Both toggles off. Does nothing, and notifies nobody, when they already are. */
export function clearDiscoverModes(): void {
  load();
  if (!current.picks && !current.near) return;
  current = OFF;
  save();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): DiscoverModes {
  load();
  return current;
}

const getServerSnapshot = (): DiscoverModes => OFF;

/**
 * The toggles on screen. `access` is whether this viewer gets the buttons at all;
 * without it `picks` and `near` are false whatever storage holds, so no other
 * account can be put into a mode by a stray key.
 */
export function useDiscoverModes(): DiscoverModes & { access: boolean } {
  const access = useDiscoverModesAccess();
  const modes = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    picks: access && modes.picks,
    near: access && modes.near,
    access,
  };
}
