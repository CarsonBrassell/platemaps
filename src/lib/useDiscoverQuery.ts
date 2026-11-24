"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForMeAccess } from "@/lib/auth";
import { clearDiscoverModes, useDiscoverModes } from "@/lib/discoverModes";
import { useNearby } from "@/lib/nearby";
import { publishQuery, useQueryString } from "@/lib/queryString";
import { fromWire } from "@/lib/discoverWire";
import { PAGE_SIZE, hasFilterParams, parseShown } from "@/lib/discoverFilters";
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
 *
 * The accounts on lib/forMeGate.ts get a position asked for on load (once per
 * tab session, see `askOnLoad` in lib/nearby.ts) and again whenever a filter is
 * on, so every card can say how far away it is. For everyone else none of that
 * runs: nothing here asks for a position and a failed request stays silent.
 *
 * The one account on the Discover buttons (lib/discoverModes.ts) has a Nearby
 * toggle: with a position known, the POST asks for `nearby=1` on top of the
 * current search. The URL, `search` and `raw` never change for it, and the page
 * is handed on with `filters.nearby` put back to false, so the toggle shows no
 * chip, no filter count and no "clear". Any applied filter turns the toggles off.
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

type Answer = { key: string; search: string; shown: number; page: DiscoverPage; near: boolean };

/** The search with the Nearby filter added, for the request body only. */
function withNearby(search: string): string {
  const params = new URLSearchParams(search);
  params.set("nearby", "1");
  return params.toString();
}

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
  // Only this hook asks on load: the other pages that read a position
  // (feed, restaurant pages, the post picker) keep their tap. It does nothing
  // for an account that is not on lib/forMeGate.ts.
  const nearby = useNearby({ askOnLoad: true });
  const access = useForMeAccess();
  const modes = useDiscoverModes();
  const [answer, setAnswer] = useState<Answer | null>(null);

  const { search, shown } = filterQueryOf(raw);
  const coords = nearby.coords;
  // Nearby needs a position to mean anything; until there is one the page is the ordinary one.
  const nearOn = modes.near && !!coords;
  const bare = search === "" && shown === PAGE_SIZE;
  const wanted =
    bare && !coords
      ? null
      : `${search}::${shown}::${coords ? `${coords.lat},${coords.lng}` : ""}${nearOn ? "::near" : ""}`;
  const answerKey = answer?.key ?? null;

  /*
   * Where a position is asked for besides the one automatic ask on load
   * (`askOnLoad` above): narrowing the grid is an act that explains the
   * permission prompt, since the cards are about to carry how far away each one
   * is. That covers a filtered URL opened cold, or after the ask on load was
   * already spent in this tab. Every surface reads this hook's `nearby`, so
   * there is one rule and one fix, not one per component.
   *
   * `hasFilterParams` rather than any query key: a landing from an ad carries
   * `utm_source` or `fbclid` and is still a bare landing.
   */
  const wantsPosition = (access && hasFilterParams(search)) || modes.near;
  const requestPosition = nearby.request;
  useEffect(() => {
    if (wantsPosition && !nearby.coords && nearby.state === "idle") requestPosition();
  }, [wantsPosition, nearby.coords, nearby.state, requestPosition]);

  // Filters and the buttons are never both on: whatever applies a filter (the
  // sheet, a chip, search text, a dish, a URL opened cold) turns both buttons off.
  // Keyed on the search only, so "Show more" does not.
  const modesAccess = modes.access;
  useEffect(() => {
    if (modesAccess && hasFilterParams(search)) clearDiscoverModes();
  }, [modesAccess, search]);

  useEffect(() => {
    if (wanted === null || answerKey === wanted) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = coords
          ? await fetch("/api/restaurants/discover", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ search: nearOn ? withNearby(search) : search, shown, coords }),
            })
          : await fetch(
              `/api/restaurants/discover?${[search, shown > PAGE_SIZE ? `shown=${shown}` : ""]
                .filter(Boolean)
                .join("&")}`,
            );
        if (!res.ok) return;
        const page = fromWire(await res.json());
        if (!cancelled) setAnswer({ key: wanted, search, shown, page, near: nearOn });
      } catch {
        // Keep what is on screen; the next change of query asks again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, answerKey, search, shown, coords, nearOn]);

  // A near answer carries filters.nearby = true, put there by the injected key. Hand the screens a copy with it
  // off (the cached page is never touched) so nothing downstream reads it as a filter the visitor chose.
  const answered = answer?.page;
  const answeredNear = answer?.near ?? false;
  const answerView = useMemo(
    () => (answered && answeredNear ? { ...answered, filters: { ...answered.filters, nearby: false } } : answered),
    [answered, answeredNear],
  );
  const view = wanted === null || !answer || !answerView ? initial : answerView;
  const onScreen = wanted === null || !answer ? { search: "", shown: PAGE_SIZE, near: false } : answer;
  const pending =
    wanted !== null &&
    answerKey !== wanted &&
    (onScreen.search !== search || onScreen.shown !== shown || onScreen.near !== nearOn);

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
    viewKey: `${onScreen.search}::${onScreen.shown}${onScreen.near ? "::near" : ""}`,
    search,
    shown,
    raw,
    nearby,
    navigate,
  };
}
