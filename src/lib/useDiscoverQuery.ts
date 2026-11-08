"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, useForMeAccess } from "@/lib/auth";
import { useNearby } from "@/lib/nearby";
import { publishQuery, useQueryString } from "@/lib/queryString";
import { fromWire } from "@/lib/discoverWire";
import { FOR_ME_PARAM, PAGE_SIZE, hasFilterParams, parseShown } from "@/lib/discoverFilters";
import { readLocalTaste, useTasteRev } from "@/lib/useTaste";
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
 * `?foryou=1` is a third thing: a mode, not a filter. The ranking is built
 * from the reader's own history, so it is never asked of the cached GET, which
 * must not carry anything personal. It is the same POST, with `forMe` and the
 * device copy of the picks in the body, answered `private, no-store`. It waits
 * for the session to resolve (a signed-out ranking must not flash before the
 * personal one) and asks again when the picks change (`tasteRev`).
 *
 * All of that is for the accounts that can see For me (lib/forMeGate.ts). For
 * everyone else `foryou` is not a mode but one more key the parser has never
 * heard of, carried in `search` and answered by the cached GET exactly as it
 * was before the feature, and none of the rest below runs: no position is asked
 * for here, nothing waits on the session, and a failed request stays silent.
 */

/* The URL, as the client sees it, comes from lib/queryString.ts — one
   `useSearchParams` under a Suspense boundary (QuerySync) feeding a store,
   because calling it here would opt the grid out of the static HTML. */

/** Query keys the page carries that are not filters and must not reach the parser. */
const NOT_FILTERS = new Set(["nav", "cols", "shown"]);

/**
 * The filter half of a query string, the page size it asks for, and whether it
 * asks for For me. `access` is `useForMeAccess()`: without it `foryou` is just
 * another key left in `search`, as it is on a site that has never heard of it.
 */
export function filterQueryOf(
  raw: string,
  access: boolean,
): { search: string; shown: number; forMe: boolean } {
  const params = new URLSearchParams(raw);
  const shown = parseShown(params.get("shown") ?? undefined);
  const filters = new URLSearchParams();
  for (const [key, value] of params) {
    if (NOT_FILTERS.has(key) || (access && key === FOR_ME_PARAM)) continue;
    filters.append(key, value);
  }
  return { search: filters.toString(), shown, forMe: access && params.get(FOR_ME_PARAM) === "1" };
}

/**
 * Whether this URL asks for a position: the For me mode is on, or the query
 * carries a real filter.
 *
 * "Real" is `hasFilterParams` (lib/discoverFilters.ts): our own filter keys
 * holding a value the parser would read. `filterQueryOf`'s `search` is every
 * key that is not paging or a mode, so it also holds whatever a link brought
 * along (`utm_source`, `fbclid`, `gclid`), and a landing from an ad must stay a
 * bare landing that never prompts. Exported so the "Show distance from you"
 * button can stand down in the one frame between a filter tap and the request
 * this asks for.
 */
export function wantsPositionOf(raw: string, access: boolean): boolean {
  const { search, forMe } = filterQueryOf(raw, access);
  return forMe || hasFilterParams(search);
}

type Answer = { key: string; search: string; shown: number; forMe: boolean; page: DiscoverPage };

export type DiscoverQuery = {
  /** The page on screen. */
  view: DiscoverPage;
  /** True while the URL asks for something other than what `view` shows. */
  pending: boolean;
  /** Changes when a different page lands — what the focus effect keys on. */
  viewKey: string;
  /** The filters the URL currently asks for (without `shown`, `nav`, `cols`, `foryou`). */
  search: string;
  shown: number;
  /** True when the URL asks for the For me ranking (`?foryou=1`) — what is asked, not what is on screen. */
  forMe: boolean;
  /** The raw query string, for a caller that needs a key this hook strips. */
  raw: string;
  /** True when the request for what the URL asks for has failed and nothing is in flight. */
  failed: boolean;
  /** Ask for it again after a failure. */
  retry: () => void;
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
  const { account, resolved } = useAuth();
  const access = useForMeAccess();
  const tasteRev = useTasteRev(access);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // The key of a request that failed, and a counter that asks again. A failure
  // used to be silent: the old page stayed up (or, on a bare `?foryou=1`, a
  // skeleton that only timed out) and nothing said the request had died.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const { search, shown, forMe } = filterQueryOf(raw, access);
  const coords = nearby.coords;
  const bare = search === "" && shown === PAGE_SIZE;
  // For me is also keyed on who is asking and on the picks, so signing in or
  // out and a love / skip each ask again. Nothing else is in the key for that.
  const forMeKey = forMe ? `::foryou:${account ? "in" : "out"}:${tasteRev}` : "";
  const wanted =
    bare && !coords && !forMe
      ? null
      : `${search}::${shown}::${coords ? `${coords.lat},${coords.lng}` : ""}${forMeKey}`;
  const answerKey = answer?.key ?? null;
  // Only For me waits on the session, and only it re-runs the request when the
  // session resolves: any other query is in flight before the account answers
  // and must not be cancelled and asked again when it does.
  const waitingForSession = forMe && !resolved;

  /*
   * The one place a position is asked for. Narrowing the grid, or turning on
   * For me, is the act that explains the permission prompt: the cards are about
   * to carry how far away each one is, and For me is something the reader has
   * just chosen. A bare landing never asks (a prompt before the visitor has
   * done anything gets denied by reflex, and a denial is sticky), so Discover
   * offers "Show distance from you" there instead, which is a tap on the same
   * nearby.request. Every surface reads this hook's `nearby`, so there is one
   * rule and one fix, not one per component.
   */
  const wantsPosition = access && (forMe || hasFilterParams(search));
  const requestPosition = nearby.request;
  useEffect(() => {
    if (wantsPosition && !nearby.coords && nearby.state === "idle") requestPosition();
  }, [wantsPosition, nearby.coords, nearby.state, requestPosition]);

  // A bare URL shows the shell, not an answer, so whatever answer is held is
  // dropped: kept, it would be shown again the moment the same key came back
  // (For me turned off and on), with a pick made in between still in the list.
  if (access && wanted === null && answer !== null) setAnswer(null);
  // Likewise a failure belongs to the query it happened to; coming back to that
  // query asks again and must not start out showing the old error.
  if (failedKey !== null && failedKey !== wanted) setFailedKey(null);

  useEffect(() => {
    if (wanted === null || answerKey === wanted) return;
    // Until the session has resolved a signed-in reader looks signed out, and
    // that ranking would paint before the personal one.
    if (waitingForSession) return;
    let cancelled = false;
    void (async () => {
      try {
        const res =
          coords || forMe
            ? await fetch("/api/restaurants/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                ...(forMe ? { cache: "no-store" as const } : {}),
                body: JSON.stringify({
                  search,
                  shown,
                  ...(coords ? { coords } : {}),
                  ...(forMe ? { forMe: true, prefs: readLocalTaste() } : {}),
                }),
              })
            : await fetch(
                `/api/restaurants/discover?${[search, shown > PAGE_SIZE ? `shown=${shown}` : ""]
                  .filter(Boolean)
                  .join("&")}`,
              );
        if (!res.ok) {
          if (access && !cancelled) setFailedKey(wanted);
          return;
        }
        const page = fromWire(await res.json());
        if (!cancelled) {
          setFailedKey(null);
          setAnswer({ key: wanted, search, shown, forMe, page });
        }
      } catch {
        // Keep what is on screen and say so (`failed`); a change of query, or
        // `retry`, asks again.
        if (access && !cancelled) setFailedKey(wanted);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, answerKey, search, shown, coords, forMe, waitingForSession, access, attempt]);

  const failed = wanted !== null && failedKey === wanted;
  const retry = useCallback(() => {
    setFailedKey(null);
    setAttempt((n) => n + 1);
  }, []);

  const view = wanted === null || !answer ? initial : answer.page;
  const onScreen =
    wanted === null || !answer ? { search: "", shown: PAGE_SIZE, forMe: false } : answer;
  // `forMe` is part of what is on screen: a bare `?foryou=1` would otherwise
  // paint the static shell's default order as if it were the personal one.
  const pending =
    wanted !== null &&
    answerKey !== wanted &&
    (onScreen.search !== search || onScreen.shown !== shown || onScreen.forMe !== forMe);

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
    viewKey: `${onScreen.search}::${onScreen.shown}${onScreen.forMe ? "::foryou" : ""}`,
    search,
    shown,
    forMe,
    raw,
    failed,
    retry,
    nearby,
    navigate,
  };
}
