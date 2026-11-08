"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  FilterControls,
  FilterRail,
  ForMePill,
  QuickFilterChips,
} from "@/components/DiscoverFilters";
import { RestaurantCard, type MatchMarks } from "@/components/RestaurantCard";
import { OurPicks } from "@/components/OurPicks";
import { ShowDistanceButton } from "@/components/ShowDistanceButton";
import { TasteChips, TasteInvite } from "@/components/TasteChips";
import { TASTE_BTN, TastePickCard } from "@/components/TastePickCard";
import { TasteSection } from "@/components/TasteSection";
import { Dialog } from "@/components/feed/Dialog";
import {
  FOR_ME_PARAM,
  NO_FILTERS,
  PAGE_SIZE,
  activeFilterCount,
  matchMarksFor,
  searchFromFilters,
  type DiscoverFilters,
  type QueryScope,
  type QuickFilter,
} from "@/lib/discoverFilters";
import { distanceLabel, type Coords } from "@/lib/geo";
import { useDiscoverQuery } from "@/lib/useDiscoverQuery";
import { useTaste } from "@/lib/useTaste";
import type { DiscoverPage, DiscoverResult } from "@/lib/discover";
import { packColumns } from "@/lib/photoShape";
import { forMeQualityNote } from "@/lib/ratingDisplay";
import type { PriceBand } from "@/data/priceBands";

/**
 * What a scoped search calls itself.
 *
 * `?in=` is only ever written by the search dropdown (`hrefForScope` in
 * components/useSuggest.ts), where the visitor has just said which reading of
 * their word they meant. The grid then holds only that reading — so a heading
 * still saying a plain "Results for" over a third of the matches would read as
 * the search being broken, which is the failure this whole feature exists to
 * fix.
 */
const SCOPE_HEADING: Record<QueryScope, string> = {
  // Not "All results for": the grid under it holds every reading of the term,
  // which is what a plain "Results for" already promises. The line is here so
  // the heading does not go missing when `?in=` is on.
  all: "Results for",
  restaurant: "Restaurant results for",
  cuisine: "Cuisine results for",
  neighborhood: "Neighborhood results for",
  dish: "Dish results for",
};

/**
 * How many columns the grid is packed into, following the `sm:grid-cols-2` on
 * the grid itself.
 *
 * The packing has to happen in JavaScript because it depends on the column
 * count, and CSS is what decides the column count. Two details keep that from
 * being a problem:
 *
 * **It starts at 2, matching what the server rendered.** Returning the real
 * answer on the first client render would make the markup disagree with the
 * server's and cost a hydration error; the media query is read in an effect
 * instead, so a phone re-packs into one column a beat after paint rather than
 * flashing the wrong thing before it.
 *
 * **The listener is on the query, not on resize.** `matchMedia` fires only when
 * the answer actually changes, so dragging a window edge across 640px re-packs
 * once instead of on every frame.
 */
function useColumnCount() {
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const sync = () => setColumns(query.matches ? 2 : 1);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return columns;
}

/**
 * What a card should light up for the filters in effect: the cuisine,
 * neighbourhood and price the grid was narrowed to, plus the score in the
 * "rated well for" category. Shared by the plain grid and the For me list so a
 * filter reads the same on either.
 */
function marksFor(restaurant: DiscoverResult, filters: DiscoverFilters): MatchMarks {
  return {
    ...matchMarksFor(restaurant, filters),
    aspect:
      filters.aspect && restaurant.aspectScore !== undefined
        ? {
            aspect: filters.aspect,
            score: restaurant.aspectScore.score,
            praised: restaurant.aspectScore.praised,
          }
        : null,
  };
}

/** The query string without the For me mode — see `apply`. */
function withoutForMe(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(FOR_ME_PARAM);
  return params.toString();
}

function ShowMoreButton({
  left,
  pending,
  onClick,
}: {
  left: number;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="min-h-11 rounded-full bg-white px-6 text-[13px] font-medium text-zinc-700 transition-colors hover:text-zinc-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        {pending ? "Loading…" : `Show more (${left} left)`}
      </button>
    </div>
  );
}

/** How long the Undo after "Been here" / "Not for me" stays up, as in useTaste. */
const UNDO_MS = 10_000;

/** How long the For me list may be missing before the page says so. */
const SLOW_MS = 10_000;

/**
 * The For me list: the whole grid ordered by how well each place fits the
 * viewer, in two blocks — the matches, then "Also well rated" so the list never
 * ends short (decision D4). The ranking is the server's; this lays it out.
 * See probe/for-me/PLAN.md.
 *
 * ## What lives here and not in DiscoverBrowser
 *
 * `useTaste` is called here, not up there. It asks the server for the Your
 * taste picks on mount, and the plain Discover page already has a TasteSection
 * doing that; one more instance there would be a second request for nothing.
 * Here the Your taste strip is hidden, so this is the one instance, and it
 * supplies what the list needs: the chip prefs for Tune and the ops behind the
 * two buttons on each card.
 *
 * ## Why the card removal and Undo are local
 *
 * "Been here" and "Not for me" ride in the next request's `prefs`, so they do
 * not refetch the list under the reader (lib/useTaste.ts). The card has to go
 * at once all the same, so the ids are held here and filtered out. useTaste has
 * its own Undo, but it only knows the cards in its Your taste carousel, which
 * are a different, shorter list; for a card from this one it offers nothing, so
 * the Undo bar is this component's.
 *
 * ## Why two grids and not one with a divider row
 *
 * The cards are packed into columns of uneven height (`packColumns`), so there
 * is no row for a full-width divider to sit in. Each block is packed on its
 * own, and the divider is a heading between them.
 */
function ForMeSection({
  view,
  pending,
  columns,
  cuisines,
  coords,
  headingRef,
  failed,
  onRetry,
  onShowMore,
  onClearFilters,
  onTurnOff,
}: {
  view: DiscoverPage;
  pending: boolean;
  /** The request for this list failed and nothing is in flight. */
  failed: boolean;
  onRetry: () => void;
  columns: number;
  /** Every cuisine, for the Tune chips — from the unfiltered shell, not the facet counts. */
  cuisines: string[];
  /** Where the reader is, for the distance on each card; null when unknown. */
  coords: Coords | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onShowMore: () => void;
  onClearFilters: () => void;
  onTurnOff: () => void;
}) {
  const { filters, results, total, shown } = view;
  // Undefined until the first personal answer lands: `view` is then the static
  // shell's default order, which must never be drawn as if it were the list.
  const info = view.forMe;
  const taste = useTaste();
  const [tuning, setTuning] = useState(false);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [last, setLast] = useState<{ kind: "been" | "hide"; id: string; name: string } | null>(
    null,
  );
  const [slow, setSlow] = useState(false);

  // The Undo bar lasts a few seconds. Keyed on `last`, which is a new object per
  // mark, so a second mark restarts the clock and the cleanup stops the old one.
  useEffect(() => {
    if (!last) return;
    const timer = setTimeout(() => setLast(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [last]);

  // A rate-limited or failed request leaves the hook on the shell with no
  // error to show. Rather than a skeleton forever, say so and offer the way out.
  const missing = !info;
  useEffect(() => {
    if (!missing) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [missing]);

  function mark(kind: "been" | "hide", restaurant: DiscoverResult) {
    setGone((prev) => new Set(prev).add(restaurant.id));
    taste.apply({ kind, value: restaurant.id });
    setLast({ kind, id: restaurant.id, name: restaurant.name });
  }

  function undo() {
    if (!last) return;
    setGone((prev) => {
      const next = new Set(prev);
      next.delete(last.id);
      return next;
    });
    taste.apply({ kind: last.kind === "hide" ? "unhide" : "unbeen", value: last.id });
    setLast(null);
  }

  // `matched` is how many of the leading results are matches; the rest are the
  // tail. Split before dropping the ones just marked, so the boundary holds.
  const matches = results.slice(0, info?.matched ?? 0).filter((r) => !gone.has(r.id));
  const tail = results.slice(info?.matched ?? 0).filter((r) => !gone.has(r.id));
  const places = total - (results.length - matches.length - tail.length);

  const cards = (items: DiscoverResult[]) => (
    <div className="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2">
      {packColumns(items, columns).map((column, i) => (
        // Index keys for the reason the plain grid gives: a column is a place
        // in the layout, not a thing.
        <div key={i} className="grid auto-rows-min content-start gap-4">
          {column.map((restaurant) => (
            <TastePickCard
              key={restaurant.id}
              restaurant={restaurant}
              score={restaurant.plateScore}
              reason={restaurant.reason?.text}
              friends={restaurant.reason?.friends}
              quality={forMeQualityNote(restaurant)}
              distance={distanceLabel(restaurant, coords)}
              shape="natural"
              match={marksFor(restaurant, filters)}
              onBeen={() => mark("been", restaurant)}
              onHide={() => mark("hide", restaurant)}
            />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <section aria-labelledby="all-restaurants">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2
          ref={headingRef}
          id="all-restaurants"
          tabIndex={-1}
          className="mono-label text-zinc-500 outline-none focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
        >
          For me
        </h2>
        {info && (
          <p role="status" className="mono-label shrink-0 tabular-nums text-zinc-500">
            {places} {places === 1 ? "place" : "places"}
          </p>
        )}
      </div>

      {/* What the list is built from, and the way to change it. Not when there
          is nothing to build from: the prompt below is the same chips. */}
      {info && info.basis !== "none" && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 px-1 text-[13px] text-pm-grey-text">
          {info.header && <p>{info.header}</p>}
          <button
            type="button"
            aria-expanded={tuning}
            onClick={() => setTuning((t) => !t)}
            className="inline-flex min-h-9 items-center font-medium underline underline-offset-2 hover:text-zinc-900 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Tune
          </button>
        </div>
      )}

      {last && (
        <div
          role="status"
          className="mb-3 flex items-center justify-between rounded-xl bg-pm-grey-tint px-4 py-2.5 text-[13px] text-pm-grey-text"
        >
          <span>{last.kind === "hide" ? `Hidden ${last.name}` : `Marked ${last.name} as been`}</span>
          <button
            type="button"
            onClick={undo}
            className="font-medium text-pm-orange-text underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}

      {tuning && info && info.basis !== "none" && (
        <div className="mb-4 rounded-2xl bg-white p-5">
          {taste.status === "loading" ? (
            <p className="text-[13px] text-zinc-500">Loading your picks…</p>
          ) : (
            <>
              <TasteChips
                mode="edit"
                cuisines={cuisines}
                loves={taste.prefs.loves}
                skips={taste.prefs.skips}
                apply={taste.apply}
              />
              <p className="mb-3 text-[13px] text-zinc-500">
                Changes re-rank this list, and Your taste on the home page.
              </p>
              <button
                type="button"
                onClick={() => {
                  // Reset un-hides and un-beens everything, so the cards this
                  // view dropped locally (and the Undo for the last of them)
                  // are no longer true; the answer it asks for has them back.
                  setGone(new Set());
                  setLast(null);
                  taste.apply({ kind: "reset" });
                }}
                className={TASTE_BTN}
              >
                Reset my taste
              </button>
            </>
          )}
        </div>
      )}

      {info && failed && (
        <p role="status" className="mb-3 px-1 text-[13px] text-pm-grey-text">
          Couldn&apos;t refresh this list.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-9 items-center font-medium underline underline-offset-2 hover:text-zinc-900 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Try again
          </button>
        </p>
      )}

      {!info && failed ? (
        <div role="alert" className="rounded-2xl bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">Couldn&apos;t load your list</p>
          <p className="mt-1 text-[13px] text-pm-grey-text">
            Check your connection and try again.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onTurnOff}
              className="min-h-11 text-[13px] font-medium text-pm-grey-text underline underline-offset-2 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Show all restaurants
            </button>
          </div>
        </div>
      ) : !info ? (
        <div aria-busy="true">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[300px] animate-pulse rounded-2xl bg-white/60" />
            ))}
          </div>
          {slow && (
            <p role="status" className="mt-4 px-1 text-[13px] text-pm-grey-text">
              This is taking longer than usual.{" "}
              <button
                type="button"
                onClick={onTurnOff}
                className="font-medium underline underline-offset-2 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Show all restaurants
              </button>
            </p>
          )}
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-900">
            {activeFilterCount(filters) > 0 ? "Nothing matches those filters" : "No places to show yet"}
          </p>
          {activeFilterCount(filters) > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Nothing to match on, or nothing in this view that matches: ask, or
              say so, then go straight to the tail. Never fake matches. */}
          {info.basis === "none" ? (
            <div className="mb-6 rounded-2xl bg-white p-5">
              <TasteInvite
                cuisines={cuisines}
                loves={taste.prefs.loves}
                skips={taste.prefs.skips}
                apply={taste.apply}
                signedIn={taste.signedIn}
              />
            </div>
          ) : (
            info.matched === 0 && (
              <p className="mb-4 px-1 text-[13px] text-pm-grey-text">
                Nothing here fits your taste yet. These are the best-rated places instead.
              </p>
            )
          )}

          <div
            className={`transition-opacity duration-200 ${pending ? "opacity-60" : "opacity-100"}`}
            aria-busy={pending}
          >
            {matches.length > 0 && cards(matches)}

            {tail.length > 0 && (
              <>
                {/* The same dotted rule the leaderboard uses between a label and
                    the rest of its row. */}
                <div className={`${matches.length > 0 ? "mt-8" : "mt-1"} mb-3 flex items-center gap-3 px-1`}>
                  <h3 className="mono-label shrink-0 text-zinc-500">Also well rated</h3>
                  <span
                    aria-hidden="true"
                    className="mb-1 h-px flex-1 border-b border-dotted border-zinc-300"
                  />
                </div>
                {cards(tail)}
              </>
            )}

            {matches.length + tail.length === 0 && (
              <p className="rounded-2xl bg-white px-6 py-8 text-center text-[13px] text-zinc-500">
                That is everything on this page.
              </p>
            )}
          </div>

          {total > shown && (
            <ShowMoreButton left={total - shown} pending={pending} onClick={onShowMore} />
          )}
        </>
      )}
    </section>
  );
}

/**
 * Discover's controls and grid.
 *
 * This component used to own the filter state, hold every restaurant, and do
 * the filtering and facet counting itself. All of that is on the server now
 * (lib/discover.ts) and it renders what it is handed — which is what keeps the
 * page a constant size no matter how many restaurants exist.
 *
 * What it still owns is the *interaction*: the URL is the query, so changing a
 * filter means writing it, and the page being a static shell (src/app/page.tsx)
 * means the answer to that URL is fetched from here rather than rendered by
 * the route. lib/useDiscoverQuery.ts is where that happens.
 */
export function DiscoverBrowser({ initial }: { initial: DiscoverPage }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const columns = useColumnCount();

  /*
   * `initial` is the static shell's unfiltered first page. Every control below
   * still writes the URL, and the hook answers it: the filtered page comes from
   * GET /api/restaurants/discover, and is asked again with coordinates once
   * "Nearby" has a position — those never go in the URL (see the route). While
   * an answer is in flight `pending` dims the grid and the previous answer
   * stays on screen, which is what the old `useTransition` bought and what
   * stops a filter click reading as jank.
   */
  const {
    view,
    pending,
    viewKey,
    forMe: forMeOn,
    failed,
    retry,
    nearby,
    navigate,
  } = useDiscoverQuery(initial, "/");
  const { filters, results, counts, options, picks, total, shown } = view;
  const active = activeFilterCount(filters);

  /*
   * For me is a mode of this same page (`?foryou=1`), and three states of it
   * matter here. `forMeOn` is what the URL asks for. The server can answer that
   * with `paused` — a pasted `?q=…&foryou=1` — meaning the text search won
   * (decision D3), in which case the page draws the ordinary search results and
   * says so rather than a For me list nobody built.
   */
  const forMePaused = forMeOn && view.forMe?.paused === true;
  const forMeMode = forMeOn && !forMePaused;

  /**
   * Navigate to a new set of filters.
   *
   * `shown` is deliberately dropped: after changing what you are looking for,
   * "show me more of the last thing" is not a request anyone made, and keeping
   * it would silently make the next query heavier than a first page.
   *
   * A typed search turns For me off (decision D3: text search wins). The two
   * are different questions — "what fits me" and "what is named this" — and a
   * search run from inside For me that kept the mode would be answered `paused`,
   * i.e. with the plain results under a URL that still says otherwise. Dropping
   * the flag here makes the URL say what is on screen. Clearing the search does
   * not bring it back; For me is a pill the visitor taps.
   */
  const apply = useCallback(
    (next: DiscoverFilters) => {
      const search = searchFromFilters(window.location.search, next);
      navigate(next.q ? withoutForMe(search) : search, null);
    },
    [navigate],
  );

  // The pill, in the strip and in the rail. Edits the one key and leaves every
  // filter alone: For me composes with them (decision D3).
  const toggleForMe = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has(FOR_ME_PARAM)) params.delete(FOR_ME_PARAM);
    else params.set(FOR_ME_PARAM, "1");
    navigate(params.toString(), null);
  }, [navigate]);

  const showMore = useCallback(
    () => navigate(window.location.search, shown + PAGE_SIZE),
    [navigate, shown],
  );

  /* The position is asked for in useDiscoverQuery (a filter, or For me, asks;
     a bare landing never does) and the prompt itself goes up in lib/nearby.ts.
     The offer to ask on purpose is the button above the plain grid. */

  /*
   * Move focus to the results heading once a navigation actually lands.
   *
   * Nothing about the DOM forces focus to move on its own — a keyboard user
   * who picked a cuisine pill, Nearby, a quick filter or Show more would be
   * left exactly where they clicked, with the grid that answers their action
   * rendered somewhere off-screen below. Keyed on `viewKey` — the signature
   * of the answer on screen — rather than on `pending`, so this fires once
   * per completed query and not on every render while one is in flight.
   * Skipped on mount: the very first render is not a navigation, and a page
   * load has no business stealing focus from wherever the visitor arrived.
   */
  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const skipNextFocus = useRef(true);
  useEffect(() => {
    if (skipNextFocus.current) {
      skipNextFocus.current = false;
      return;
    }
    resultsHeadingRef.current?.focus();
  }, [viewKey]);

  /*
   * Every handler builds on `filters` — what is currently in effect, as
   * resolved by the server — rather than on a state updater, because there is
   * no local filter state left to update.
   */

  // Neighbourhood and Nearby are one dimension — picking either clears the
  // other, so the "where" question only ever has one answer on screen.
  function setNeighborhood(neighborhood: string | null) {
    apply({ ...filters, neighborhood, nearby: false });
  }

  function toggleNearby() {
    const on = !filters.nearby;
    // Asked only on the way on, and only when there's nothing cached — a
    // second tap to turn it off must never raise the prompt again.
    if (on && !nearby.coords) nearby.request();
    apply({
      ...filters,
      nearby: on,
      neighborhood: on ? null : filters.neighborhood,
    });
  }

  function setCuisine(cuisine: string | null) {
    apply({ ...filters, cuisine });
  }

  function setPrice(price: PriceBand | null) {
    apply({ ...filters, price });
  }

  function setAspect(aspect: string | null) {
    apply({ ...filters, aspect });
  }

  function toggleQuick(value: QuickFilter) {
    apply({
      ...filters,
      quick: filters.quick.includes(value)
        ? filters.quick.filter((q) => q !== value)
        : [...filters.quick, value],
    });
  }

  function clearAll() {
    apply(NO_FILTERS);
  }

  // Drops the text term and keeps every filter — the two are separate choices
  // and a search made inside a cuisine shouldn't take the cuisine with it when
  // it goes.
  // The scope goes with it: it is a narrowing *of* the term (`?q=thai&in=cuisine`
  // means "the cuisine reading of thai"), so it has nothing to narrow once the
  // term is gone. `searchFromFilters` already drops it, but leaving it in state
  // would make the filters object briefly describe something the URL doesn't.
  function clearQuery() {
    apply({ ...filters, q: null, scope: null });
  }

  // The named dish is its own axis for the same reason: it was picked off the
  // dropdown, not typed into the field, so dropping it must not take the typed
  // term with it.
  function clearDish() {
    apply({ ...filters, dish: null });
  }

  const nearbyProps = {
    state: nearby.state,
    count: counts.nearby,
    saved: nearby.saved,
    setSavedLocation: nearby.setSavedLocation,
    clearSavedLocation: nearby.clearSavedLocation,
  };

  const emptyHint = filters.dish
    ? // Honest about what `?dish=` does: it is an equality on the menu wording
      // (dishesNamedExactly in lib/db.ts), not a search, so a place serving the
      // same thing under a longer name is genuinely not a match.
      "A dish picked off the dropdown matches menu wording exactly — searching the words instead will also reach places that spell it differently."
    : !filters.q
      ? "Every option in the rail shows how many places it would return — the ones reading 0 are the ones ruling everything out."
      : active > 1
        ? "Search covers names, cuisines and neighborhoods, and the filters still apply on top of it."
        : "Search covers names, cuisines and neighborhoods. A shorter term will reach more places.";

  return (
    <div>
      {/* Under `lg` the rail would stack full-width and push every result off
          the first screen. This is what replaces it: one line holding the
          toggles people reach for most, with the rest a tap away. */}
      <div className="flex items-center gap-2 overflow-x-auto py-2 lg:hidden">
        <ForMePill on={forMeOn} onToggle={toggleForMe} />

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-label={active > 0 ? `Filters, ${active} applied` : "Filters"}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] text-zinc-700 transition-colors hover:text-zinc-900 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Filters
          {active > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-zinc-500">
              {active}
            </span>
          )}
        </button>

        <QuickFilterChips
          quick={filters.quick}
          counts={counts.quick}
          onQuick={toggleQuick}
        />
      </div>

      <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-8">
        <FilterRail
          filters={filters}
          counts={counts}
          neighborhoods={options.neighborhoods}
          cuisines={options.cuisines}
          prices={options.prices}
          aspects={options.aspects}
          nearby={nearbyProps}
          onNeighborhood={setNeighborhood}
          onNearby={toggleNearby}
          onCuisine={setCuisine}
          onPrice={setPrice}
          onAspect={setAspect}
          onQuick={toggleQuick}
          onClear={clearAll}
          forMe={forMeOn}
          onForMe={toggleForMe}
        />

        {/* Lifted so the top of the first row of restaurant cards is level with
            the top of the FILTERS card — white edge to white edge, which is the
            alignment you actually read.
         *
         * 25.2px is exactly what sits above those cards inside this column: the
         * "Our picks" label's 13.2px line box + the 12px mb-3 under it. That
         * puts the label itself up in the band between the header and the rail,
         * which is empty at this x — the clock is far left at x≤104, the cards
         * start at x=290.
         *
         * Aligning box edges rather than text needs no optical fudge, unlike
         * the label-to-edge version this replaces.
         *
         * lg only — below lg the rail is `hidden` and there is no edge to align
         * to. */}
        <main className="min-w-0 flex-1 lg:-mt-[25.2px]">
          {/* Picks are a curated strip, not a search result — they stay put
              while a filter is on rather than disappearing. In For me they step
              aside: that list is the full version of Your taste, and showing
              both would put the same cards on the page twice. */}
          {active === 0 && !forMeOn && (
            <TasteSection
              cuisines={initial.options.cuisines.map((o) => o.value)}
              coords={nearby.coords}
            />
          )}
          {active === 0 && !forMeOn && <OurPicks picks={picks} />}

          {forMeMode ? (
            <ForMeSection
              view={view}
              pending={pending}
              failed={failed}
              onRetry={retry}
              columns={columns}
              cuisines={initial.options.cuisines.map((o) => o.value)}
              coords={nearby.coords}
              headingRef={resultsHeadingRef}
              onShowMore={showMore}
              onClearFilters={clearAll}
              onTurnOff={toggleForMe}
            />
          ) : (
          <section aria-labelledby="all-restaurants">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
              {/* A searched term becomes the heading, because it is what the
                  page is now about. Terms the rail could express never reach
                  here — "Thai" arrives as the cuisine filter (see `promote` in
                  lib/discoverFilters.ts), so this only ever holds the free text
                  that is genuinely a search: a restaurant's name, a word. */}
              <div className="flex min-w-0 items-baseline gap-2">
                <h2
                  ref={resultsHeadingRef}
                  id="all-restaurants"
                  tabIndex={-1}
                  className="truncate font-display text-lg font-semibold tracking-tight text-zinc-900 outline-none focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
                >
                  {filters.q
                    ? `${filters.scope ? SCOPE_HEADING[filters.scope] : "Results for"} “${filters.q}”`
                    : active > 0
                      ? "Matching restaurants"
                      : "All restaurants"}
                </h2>
                {/* Same underlined-text treatment as the rail's Clear, because
                    it is the same rank of control — the quiet way out of a
                    choice, not something competing with the results. */}
                {filters.q && (
                  <button
                    type="button"
                    onClick={clearQuery}
                    className="shrink-0 rounded-full px-1 py-0.5 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    Clear search
                  </button>
                )}
                {/* A chip rather than the underlined link the search gets: the
                    dish is a *choice off a list*, and it has to read back the
                    exact wording that was picked, because that wording is
                    precisely what the grid is matching on. Nothing else on this
                    row names the filter it removes. */}
                {filters.dish && (
                  <button
                    type="button"
                    onClick={clearDish}
                    aria-label={`Remove the ${filters.dish} dish filter`}
                    className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    <span className="truncate">
                      <span className="text-zinc-500">Serving</span>{" "}
                      {filters.dish}
                    </span>
                    <span aria-hidden="true" className="text-zinc-400">
                      ×
                    </span>
                  </button>
                )}
              </div>
              {/* Announced rather than silent: on a phone the grid change can
                  be entirely below the fold. */}
              <p
                role="status"
                className="mono-label shrink-0 tabular-nums text-zinc-500"
              >
                {total} {total === 1 ? "place" : "places"}
              </p>
            </div>

            {/* The URL still says For me, but a search is on, and the search
                wins (decision D3) — the server answered it as `paused`. Say why
                the list is not ranked rather than leave the lit pill unexplained. */}
            {forMePaused && (
              <p className="mb-3 px-1 text-[13px] text-pm-grey-text">
                For me is paused while you search.
              </p>
            )}

            {results.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-12 text-center">
                <p className="text-sm font-medium text-zinc-900">
                  {filters.dish
                    ? `No menus list “${filters.dish}”`
                    : filters.q
                      ? `Nothing matches “${filters.q}”`
                      : "Nothing matches those filters"}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] text-zinc-500">
                  {emptyHint}
                </p>
                {/* Clears the narrower thing. With a filter also on it is
                    genuinely ambiguous which of the two emptied the grid, and
                    dropping the search first leaves the visitor inside the
                    filter they chose deliberately rather than back at the top
                    of the city. The dish goes before the search for the same
                    reason it goes before it in `matchesFilters`: an exact menu
                    match is the narrowest thing on the page. */}
                <button
                  type="button"
                  onClick={
                    filters.dish ? clearDish : filters.q ? clearQuery : clearAll
                  }
                  className="mt-4 min-h-11 rounded-full bg-pm-orange px-5 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {filters.dish
                    ? "Clear dish"
                    : filters.q
                      ? "Clear search"
                      : "Clear filters"}
                </button>
              </div>
            ) : (
              <>
                {/* Only while no position is known and one could still be
                    given; gone once it is asked for, answered or refused. */}
                <div className="px-1">
                  <ShowDistanceButton nearby={nearby} />
                </div>
                {/* Dimmed, not replaced. The previous answer staying legible
                    under a pending one is the whole reason a filter click still
                    feels immediate now that it costs a request. */}
                <div
                  className={`grid auto-rows-min grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 ${
                    pending ? "opacity-60" : "opacity-100"
                  }`}
                  aria-busy={pending}
                >
                  {packColumns(results, columns).map((column, i) => (
                    // Index keys, and correctly: a column is a position in the
                    // layout, not a thing. Its identity *is* "the first
                    // column", and it holds a different set of restaurants on
                    // every render by design.
                    <div key={i} className="grid auto-rows-min content-start gap-4">
                      {column.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      shape="natural"
                      score={restaurant.plateScore}
                      match={marksFor(restaurant, filters)}
                      distance={distanceLabel(restaurant, nearby.coords)}
                    />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Only when there is genuinely more. The count beside it is
                    what makes this a decision rather than a guess. */}
                {total > shown && (
                  <ShowMoreButton left={total - shown} pending={pending} onClick={showMore} />
                )}
              </>
            )}
          </section>
          )}
        </main>
      </div>

      {sheetOpen && (
        <Dialog
          title="Filters"
          variant="sheet"
          onClose={() => setSheetOpen(false)}
          footer={
            <div className="flex items-center gap-3">
              {active > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="min-h-11 shrink-0 rounded-full px-2 text-[13px] text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="min-h-11 flex-1 rounded-full bg-pm-orange px-4 text-[13px] font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Show {total} {total === 1 ? "place" : "places"}
              </button>
            </div>
          }
        >
          <div className="px-5 py-4">
            <FilterControls
              filters={filters}
              counts={counts}
              neighborhoods={options.neighborhoods}
              cuisines={options.cuisines}
              prices={options.prices}
              aspects={options.aspects}
              nearby={nearbyProps}
              onNeighborhood={setNeighborhood}
              onNearby={toggleNearby}
              onCuisine={setCuisine}
              onPrice={setPrice}
              onAspect={setAspect}
              onQuick={toggleQuick}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
