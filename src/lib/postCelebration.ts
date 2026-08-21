"use client";

import { useSyncExternalStore } from "react";

/**
 * The moment between pressing "Post it" and watching the plate land.
 *
 * Posting spans two routes — the composer publishes, then pushes `/m/feed` —
 * and the celebration has to survive that boundary, so neither screen can own
 * it. `PostFlash` renders from `PhoneShell`, above both, and reads this; the
 * composer opens it and the feed closes it once the plate is actually on
 * screen. Nothing about the animation lives in a page component.
 *
 * The flash is deliberately opened *before* the request rather than after it
 * succeeds. The white screen is doing two jobs at once — it is the
 * confirmation, and it is the cover over a POST plus a navigation plus the
 * feed's own fetch. Waiting for the response first would mean a spinner and
 * then a celebration, which is the same wait with an extra state in it.
 *
 * ## Why the timings are floors and ceilings rather than a duration
 *
 * The publish round trip is not a fixed length, so the flash cannot be either.
 * Instead the store holds two bounds and lets the network fill the middle:
 *
 * - **A floor**, so a fast publish does not cut the meal short. It is derived
 *   from `EAT` below rather than guessed, because the screen exists to play
 *   that animation and a publish that returns in 300ms must not truncate it.
 * - **A ceiling**, so nothing can trap someone behind a white screen. If the
 *   feed never reports back — a dropped connection, a post that does not come
 *   back in the list — this closes anyway and drops them on whatever the feed
 *   managed to render.
 */

/** What the feed needs to know about the plate that was just published. */
export type PostLanding = {
  postId: string;
  /** PM Points the API says this post earned, for the feed's banner. */
  earned: number;
};

/**
 * How the mark gets eaten, in one place.
 *
 * `PostFlash` runs the bites off these numbers and the floor below is derived
 * from them, so the screen cannot come down mid-chew. Changing the pace here
 * moves both; there is deliberately no second copy of the timing in the
 * component.
 */
export const EAT = {
  /** After the punch has landed — the mark is bitten, not born bitten. */
  firstBiteAt: 700,
  biteEvery: 700,
  /** Four, and four is enough to clear the mark — see BITES in PostFlash. */
  bites: 4,
  /* The pause on the empty plate before the post is spat out. It also has to
     outlast the shake the fourth bite kicks off (0.2s), or the shake's
     transform and the vanish's transition fight over the same property. */
  crumbsAfter: 300,
  crumbsFade: 400,
} as const;

/** Punch, four bites, gone. 3.5s exactly. */
export const EAT_TOTAL_MS =
  EAT.firstBiteAt + (EAT.bites - 1) * EAT.biteEvery + EAT.crumbsAfter + EAT.crumbsFade;

/* The floor is the animation's own length plus a beat, because the whole point
   of the screen is to play it: closing at the old 950ms would have cut the
   mark in half mid-meal. */
const MIN_ON_SCREEN_MS = EAT_TOTAL_MS + 90;

/* Reduced motion never sees the meal, so it must not serve the wait either —
   there is nothing to play, and holding a still screen for two seconds to
   protect an animation that was switched off is just a delay. */
const MIN_ON_SCREEN_REDUCED_MS = 650;

/* The escape hatch. Nothing may hold the screen longer than this, whatever
   the network is doing. Above the floor by enough that a slow publish still
   gets covered rather than being dumped out mid-request. */
const MAX_ON_SCREEN_MS = 6000;

/** Read per-open rather than cached: the setting can change between posts. */
function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let open = false;
let openedAt = 0;
let floorMs = MIN_ON_SCREEN_MS;
let minTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function clearTimers() {
  if (minTimer) clearTimeout(minTimer);
  if (maxTimer) clearTimeout(maxTimer);
  minTimer = null;
  maxTimer = null;
}

/** Raise the flash. Called on the tap, not on the response. */
export function openPostFlash() {
  if (open) return;
  open = true;
  openedAt = Date.now();
  floorMs = reducedMotion() ? MIN_ON_SCREEN_REDUCED_MS : MIN_ON_SCREEN_MS;
  clearTimers();
  maxTimer = setTimeout(finish, MAX_ON_SCREEN_MS);
  emit();
}

/**
 * Ask for the flash to come down.
 *
 * Honours the floor: called too early it schedules itself for the remainder
 * rather than closing, so every caller can just say "done" without knowing how
 * long the screen has been up. Safe to call more than once — the composer
 * calls it on failure and the feed calls it on arrival, and only one of those
 * happens per post.
 */
export function closePostFlash() {
  if (!open) return;
  const held = Date.now() - openedAt;
  if (held >= floorMs) {
    finish();
    return;
  }
  if (minTimer) return;
  minTimer = setTimeout(finish, floorMs - held);
}

function finish() {
  clearTimers();
  open = false;
  emit();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return open;
}

/* Never raised on the server: the flash is only ever a response to a tap that
   has already happened in this browser. */
function getServerSnapshot() {
  return false;
}

export function usePostFlash() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/*
 * The plate itself, handed across the navigation.
 *
 * Same mechanism and the same lifetime as `photoHandoff` — a module variable
 * survives client-side navigation but not a reload, which is exactly right
 * here: a reloaded feed is just the feed, with no post to make a fuss about
 * and no stale banner claiming points that were awarded some time ago.
 */
let pending: PostLanding | null = null;
let lastTaken: { at: number; landing: PostLanding | null } = { at: 0, landing: null };

export function stashLanding(landing: PostLanding) {
  pending = landing;
}

/**
 * Returns the landing and clears it, so a later visit to the feed is an
 * ordinary one.
 *
 * The one-second replay is `takePhotos`'s, for the same reason: React's
 * development double-invocation asks twice from the same mount, and without it
 * the second ask comes back empty and the plate lands with no celebration in
 * dev but with one in production.
 */
export function takeLanding(): PostLanding | null {
  if (pending) {
    lastTaken = { at: Date.now(), landing: pending };
    pending = null;
    return lastTaken.landing;
  }
  return Date.now() - lastTaken.at < 1000 ? lastTaken.landing : null;
}
