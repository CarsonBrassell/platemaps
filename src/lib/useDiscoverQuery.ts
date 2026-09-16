"use client";

import { useCallback, useEffect, useState } from "react";
import { useNearby } from "@/lib/nearby";
import { publishQuery, useQueryString } from "@/lib/queryString";
import { fromWire } from "@/lib/discoverWire";
import { PAGE_SIZE, parseShown } from "@/lib/discoverFilters";
import type { DiscoverPage } from "@/lib/discover";

/**
 * The Discover query, answered on the client (probe/PERF-PLAN.md S3).
 *
 * `/` and `/m` are static shells: the server renders the unfiltered first
 * page once and serves it from the CDN (see the `revalidate` export on each
 * page). The URL is still the query — `?cuisine=Thai&shown=48` is what it
 * always was, shareable and in history — but it is answered here, by
 * fetching that page from /api/restaurants/discover, rather than by rendering
 * the route again on every keystroke. Both surfaces use this hook; the phone
 * navigates with links and the web with `navigate`, and neither re-renders
 * the route.
 *
 * What is on screen is always a whole page, never a blend: `view` is either
 * the server's shell (a bare URL with no position known), or the last answer
 * that arrived. While a new answer is in flight the old one stays up and
 * `pending` is true, which is what the old `useTransition` dimming did.
 *
 * Position never goes in the URL. When the browser knows where the reader is,
 * the same query is POSTed with the coordinates instead of GET — the answer
 * carries distances and a nearby ordering, and it is not cacheable, which is
 * why the two are different requests.
 */

/* The URL, as the client sees it, comes from lib/queryString.ts — one
   `useSearchParams` under a Suspense boundary (QuerySync) feeding a store,
   because calling it here would opt the grid out of the static HTML. */

/** Query keys the page carries that are not filters and must not reach the parser. */
const NOT_FILTERS = new Set(["nav", "cols", "shown"]);

/** The filter half of a query string, and the page size it asks for. */
export function filterQueryOf(raw: string): { search: string; shown: number } {
  const params = new URLSearchParams(raw);
  const shown = parseShown(params.get("shown") ?? undefined);
  const filters = new URLSearchParams();
  for (const [key, value] of params) if (!NOT_FILTERS.has(key)) filters.append(key, value);
  return { search: filters.toString(), shown };
}

type Answer = { key: string; search: string; shown: number; page: DiscoverPage };

export type DiscoverQuery = {
  /** The page on screen. */
  view: DiscoverPage;
  /** True while the URL asks for something other than what `view` shows. */
  pending: boolean;
  /** Changes when a different page lands — what the focus effect keys on. */
  viewKey: string;
  /** The filters the URL currently asks for (without `shown`, `nav`, `cols`). */
  search: string;
  shown: number;
  /** The raw query string, for a caller that needs a key this hook strips. */
  raw: string;
  nearby: ReturnType<typeof useNearby>;
  /**
   * Point the URL at a new query without a route render: `search` is the
   * full query string to keep (filters and any carried keys), `shown` the
   * page size or null for the first page.
   */
  navigate: (search: string, shown: number | null) => void;
};

export function useDiscoverQuery(initial: DiscoverPage, basePath: "/" | "/m"): DiscoverQuery {
  const raw = useQueryString();
  const nearby = useNearby();
  const [answer, setAnswer] = useState<Answer | null>(null);

  const { search, shown } = filterQueryOf(raw);
  const coords = nearby.coords;
  const bare = search === "" && shown === PAGE_SIZE;
  const wanted =
    bare && !coords
      ? null
      : `${search}::${shown}::${coords ? `${coords.lat},${coords.lng}` : ""}`;
  const answerKey = answer?.key ?? null;

  useEffect(() => {
    if (wanted === null || answerKey === wanted) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = coords
          ? await fetch("/api/restaurants/discover", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ search, shown, coords }),
            })
          : await fetch(
              `/api/restaurants/discover?${[search, shown > PAGE_SIZE ? `shown=${shown}` : ""]
                .filter(Boolean)
                .join("&")}`,
            );
        if (!res.ok) return;
        const page = fromWire(await res.json());
        if (!cancelled) setAnswer({ key: wanted, search, shown, page });
      } catch {
        // Keep what is on screen; the next change of query asks again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, answerKey, search, shown, coords]);

  const view = wanted === null || !answer ? initial : answer.page;
  const onScreen = wanted === null || !answer ? { search: "", shown: PAGE_SIZE } : answer;
  const pending =
    wanted !== null && answerKey !== wanted && (onScreen.search !== search || onScreen.shown !== shown);

  const navigate = useCallback(
    (nextSearch: string, nextShown: number | null) => {
      const params = new URLSearchParams(nextSearch);
      params.delete("shown");
      if (nextShown !== null && nextShown > PAGE_SIZE) params.set("shown", String(nextShown));
      const query = params.toString();
      // Next's router patches replaceState, so useSearchParams (and through
      // it DiscoverQuerySync) sees this too; publishing directly as well means
      // the fetch starts on this tick rather than after the bridge's effect.
      window.history.replaceState(null, "", query ? `${basePath}?${query}` : basePath);
      publishQuery(query);
    },
    [basePath],
  );

  return {
    view,
    pending,
    viewKey: `${onScreen.search}::${onScreen.shown}`,
    search,
    shown,
    raw,
    nearby,
    navigate,
  };
}
