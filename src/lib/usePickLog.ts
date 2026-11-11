"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

/**
 * Reports what became of a row of For me picks: which cards were really on
 * screen (half the card, for a second) and which one was opened. Feeds the
 * activity log behind `/api/account/taste/event` (lib/tasteLog.ts).
 *
 * Dish-level test accounts only. With `on` false or no `batch` it does nothing
 * at all, and it never renders anything, so the row's markup is the same either
 * way: the caller puts `attach` (as the ref) and `handlers` on the row's own <section>.
 *
 * A pick's card is found by its link: the anchor inside the row whose path ends
 * in the place's id (lib/restaurantHref.ts). Been here / Not for me are not
 * reported from here; the picks route logs them off the op.
 */

const ENDPOINT = "/api/account/taste/event";
/** How much of a card must be on screen, and for how long, to count as seen. */
const HALF = 0.5;
const DWELL_MS = 1000;
/** Sightings are gathered for this long and sent together. */
const FLUSH_MS = 1200;
/** The most sightings one request may carry (the route's own limit). */
const MAX_SEEN = 40;

function report(body: Record<string, unknown>) {
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      // An open is followed by a navigation; the report must outlive the page.
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    /* the log never gets in the way of the row */
  }
}

/** The place a card link points at: the last segment of its path. */
function placeId(a: HTMLAnchorElement): string | null {
  try {
    const last = new URL(a.href, window.location.href).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

type Handlers = {
  onClickCapture?: (e: MouseEvent<HTMLElement>) => void;
  onAuxClickCapture?: (e: MouseEvent<HTMLElement>) => void;
};

export function usePickLog({
  on,
  batch,
  ids,
  surface,
}: {
  /** The viewer is on the dish-level test. */
  on: boolean;
  /** The picks reply's `batch`: the name of the row on screen. */
  batch: string | undefined;
  /** The places in that row. Only the ones with a card in the DOM are watched. */
  ids: readonly string[];
  surface: "web" | "phone";
}): { attach: ((el: HTMLElement | null) => void) | undefined; handlers: Handlers } {
  // State, not a ref object: the row can mount after the picks arrive, and the watcher has to start then.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const key = ids.join("\n");
  const live = on && !!batch;
  // Places already reported as seen, per batch, so a re-render of the same row reports nothing twice.
  const seen = useRef<{ batch: string; ids: Set<string> }>({ batch: "", ids: new Set() });

  useEffect(() => {
    if (!live || !batch || !root || typeof IntersectionObserver === "undefined") return;
    if (seen.current.batch !== batch) seen.current = { batch, ids: new Set() };
    const reported = seen.current.ids;
    const wanted = new Set(key ? key.split("\n") : []);
    const cards = new Map<Element, string>();
    const dwell = new Map<string, ReturnType<typeof setTimeout>>();
    const pending = new Set<string>();
    // Cards at least half on screen now, whether or not their second is being counted.
    const inView = new Set<string>();
    const looking = () => document.visibilityState === "visible";
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
      if (pending.size === 0) return;
      const list = [...pending];
      pending.clear();
      for (let i = 0; i < list.length; i += MAX_SEEN) {
        report({ batch, surface, seen: list.slice(i, i + MAX_SEEN) });
      }
    };
    const disarm = (id: string) => {
      const t = dwell.get(id);
      if (t) clearTimeout(t);
      dwell.delete(id);
    };
    const arm = (id: string) => {
      dwell.set(
        id,
        setTimeout(() => {
          dwell.delete(id);
          reported.add(id);
          pending.add(id);
          if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
        }, DWELL_MS),
      );
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = cards.get(e.target);
          if (!id || reported.has(id)) continue;
          if (e.isIntersecting && e.intersectionRatio >= HALF) {
            inView.add(id);
            // A hidden tab shows nobody anything: the second starts when it is looked at.
            if (looking() && !dwell.has(id)) arm(id);
          } else {
            inView.delete(id);
            disarm(id);
          }
        }
      },
      { threshold: HALF },
    );
    // The row swaps its cards without the picks changing (See all, a card taken out): watch the ones it holds now.
    const scan = () => {
      for (const [el, id] of cards) {
        if (el.isConnected && placeId(el as HTMLAnchorElement) === id) continue;
        io.unobserve(el);
        cards.delete(el);
        inView.delete(id);
        disarm(id);
      }
      root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        if (cards.has(a)) return;
        const id = placeId(a);
        if (!id || !wanted.has(id) || reported.has(id)) return;
        cards.set(a, id);
        io.observe(a);
      });
    };
    scan();
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(scan);
    mo?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    // Looking away stops every count and sends what was gathered; coming back starts the counts again from zero.
    const onVisibility = () => {
      if (looking()) {
        for (const id of inView) if (!reported.has(id) && !dwell.has(id)) arm(id);
      } else {
        for (const id of [...dwell.keys()]) disarm(id);
        flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Closing the tab skips the cleanup below; this sends what was gathered.
    window.addEventListener("pagehide", flush);
    return () => {
      mo?.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      for (const t of dwell.values()) clearTimeout(t);
      flush();
    };
  }, [live, batch, key, surface, root]);

  const open = (e: MouseEvent<HTMLElement>) => {
    if (!live || !batch) return;
    // A middle click opens the place in a new tab; the other extra buttons open nothing.
    if (e.type === "auxclick" && e.button !== 1) return;
    const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
    const id = a ? placeId(a) : null;
    if (id && ids.includes(id)) report({ batch, surface, open: id });
  };

  return {
    attach: live ? setRoot : undefined,
    handlers: live ? { onClickCapture: open, onAuxClickCapture: open } : {},
  };
}
