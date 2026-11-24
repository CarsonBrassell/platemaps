"use client";

import { useSyncExternalStore } from "react";
import { useDiscoverModesAccess } from "@/lib/auth";

/**
 * Kept in localStorage so the choice survives an app launch; only the two booleans are
 * stored, never a position. With nothing saved, For me is on and Nearby is off; once
 * the viewer switches For me off, that is saved too and sticks. A filter turning the
 * buttons off (clearDiscoverModes) is not a choice, so it is not saved. Every storage
 * access is guarded, since a private window throws.
 */
export type DiscoverModes = { picks: boolean; near: boolean };

const KEY = "pm.discover.modes.v1";
const OFF: DiscoverModes = { picks: false, near: false };
const DEFAULT: DiscoverModes = { picks: true, near: false };

// The server render and the hydration pass see OFF (getServerSnapshot); the saved or
// default state arrives on the first client snapshot after that, so no mismatch. The
// snapshot object only changes when a value does.
let current: DiscoverModes = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      if (typeof o.picks === "boolean" && typeof o.near === "boolean") {
        current = o.picks || o.near ? { picks: o.picks, near: o.near } : OFF;
      }
    }
  } catch {
    /* blocked storage or a bad value: the default holds */
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ picks: current.picks, near: current.near }));
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
