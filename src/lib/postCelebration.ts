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
 * - **A floor**, so a fast publish does not strobe. Under ~1s the mark would
 *   punch in and be gone before it read as anything.
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

/* Long enough for the mark to punch in and be read as the logo rather than a
   blink. Rarely the binding constraint — publish plus navigation plus the
   feed's first fetch usually costs more than this on its own. */
const MIN_ON_SCREEN_MS = 950;

/* The escape hatch. Nothing may hold the screen longer than this, whatever
   the network is doing. */
const MAX_ON_SCREEN_MS = 4000;

let open = false;
let openedAt = 0;
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
  if (held >= MIN_ON_SCREEN_MS) {
    finish();
    return;
  }
  if (minTimer) return;
  minTimer = setTimeout(finish, MIN_ON_SCREEN_MS - held);
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
