"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * The URL's query string, readable from any client component on a static page.
 *
 * `useSearchParams` is the obvious way to read `?nav=` or `?dish=`, and on a
 * page rendered per request it is fine. On a prerendered page it is not: it
 * opts everything up to the nearest Suspense boundary out of the HTML — the
 * server cannot know the query — so a static `/m` whose screen calls it
 * ships as an empty shell and paints only once the JavaScript has run, and a
 * static `/restaurant/[id]` with no boundary at all is a 500. That is the
 * trap probe/PERF-PLAN.md S3 and S4 walked into when `/`, `/m` and the
 * restaurant pages became static.
 *
 * So `useSearchParams` is called in exactly one place, `QuerySync`
 * (components/QuerySync.tsx), which sits under its own Suspense boundary and
 * publishes here; everything else reads through `useQueryParams`. The server
 * snapshot is the empty query — the prerender renders as if the URL were
 * bare, which is what the CDN copy has to be anyway — and the client's first
 * snapshot is `window.location.search`, so hydration corrects it in the same
 * pass without waiting for the bridge to mount.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

/** Called by QuerySync on every navigation; null when it unmounts. */
export function publishQuery(raw: string | null): void {
  if (raw === current) return;
  current = raw;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): string =>
  current ?? (typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, ""));
const getServerSnapshot = (): string => "";

/** The query string without its `?`, empty on the server. */
export function useQueryString(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The same, parsed. Stable between navigations, so it is safe as an effect dependency. */
export function useQueryParams(): URLSearchParams {
  const raw = useQueryString();
  return useMemo(() => new URLSearchParams(raw), [raw]);
}
