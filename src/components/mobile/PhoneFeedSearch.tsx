"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CloseIcon } from "@/components/icons";
import { QUERY_PARAM } from "@/lib/discoverFilters";

/**
 * Search, on the row under the feed tabs, sharing it with the sort switch.
 *
 * It has been in three places now, and the reasons matter because two of them
 * were right about something:
 *
 * - **The header**, which is where a desktop puts it and where a phone
 *   shouldn't: the top-right corner is the furthest point on the screen from a
 *   thumb holding the device.
 * - **Floating at the bottom-right**, which fixed the reach and broke
 *   something worse — a 48px disc pinned above the nav sits *on top of the
 *   feed*, and what it covered was the bottom-right corner of whatever card
 *   was under it, which is where that card keeps its own controls.
 * - **Here**, beside Trending/New. Out of the cards' way, and grouped with the
 *   other control that modifies the list rather than floating over it.
 *
 * The reach argument the bottom placement was built on is real but it is
 * answered elsewhere: the five things a thumb reaches for constantly are the
 * nav, and the nav is already pinned to the bottom. Search is not one of them.
 *
 * ## Why it takes the sort switch as `leading`
 *
 * The closed disc and the open field are two rows — a field opening *inside*
 * the sort row would have ~180px to work with, which is not a field you can
 * read your own query back out of. So this owns both rows: the control row it
 * shares with whatever `leading` is, and the field row underneath it. Handing
 * the sort switch in keeps the disclosure state and the field it discloses in
 * one component instead of lifting `open` into the screen and scattering the
 * two halves across it.
 *
 * ## Where a submit goes
 *
 * Default is Discover with `?q=`, the same thing the web header's search
 * does — a search is a fresh question, not a narrowing of whatever Discover
 * was last left on. `filtersFromSearch` promotes a term that names a real
 * cuisine or neighbourhood into that filter, so searching "thai" lands on
 * Discover with Thai lit in the rail rather than on a text match.
 *
 * On the card tabs (Feed, Friends feed) `PhoneFeedScreen` passes `onSearch`
 * instead, and a submit narrows the list already on screen — a different
 * question ("who said what about the carbonara") than Discover answers ("show
 * me Italian places"). What a term reaches there is lib/feedFilters.ts's
 * business: the caption, the dish, the restaurant and its cuisine, the author,
 * the tags, and every comment on the plate. The map tab gets no `onSearch`, so
 * it keeps the navigate-to-Discover behaviour; there's no scrollable list on
 * that tab to narrow.
 *
 * There is deliberately **no typeahead**: the dropdown is the part of
 * `RestaurantSearch` that needs a per-keystroke request and a second set of
 * routes, and neither is worth inventing when the destination screen answers
 * the same question with counts and filters.
 *
 * ## This is the card tabs' search only
 *
 * The map tab does not render it. That tab's field is `PhoneMapSearch`, which
 * lives inside the map (RestaurantMap's `searchField`) in the bottom-right
 * corner, because it does a different job: it lights the matches on the tiles
 * and flies the camera to them rather than navigating anywhere. It needs the
 * map's `mapRef` to do either, which is a thing this component has no way to
 * hold.
 *
 * The bottom-right placement that failed here works there for the reason it
 * failed here — the objection was that a control pinned over a scrolling feed
 * covers the bottom-right corner of whatever card is under it, which is where
 * that card keeps its own controls. A map has no cards.
 */
export function PhoneFeedSearch({
  /** Rendered at the left of the control row — the sort switch and the Filters
      button, on the tabs that have them. */
  leading,
  /** The term as the screen currently holds it, so clearing it from the summary
      chip above the feed empties the box too. Ignored without `onSearch`, since
      the navigating variant keeps no term to be out of step with. */
  value = "",
  /** When set, a submit calls this instead of navigating to Discover. */
  onSearch,
}: {
  leading?: ReactNode;
  value?: string;
  onSearch?: (term: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* Focus follows the disclosure — a field that appears and does not take the
     caret costs a second tap on a phone, where the keyboard is the point. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Reseeded when the term changes from outside — a Clear on the summary chip,
     or the filters being reset. Compared against the last value seen rather
     than set unconditionally so this cannot fight the caret mid-word. */
  const seen = useRef(value);
  useEffect(() => {
    if (value === seen.current) return;
    seen.current = value;
    setTerm(value);
  }, [value]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    inputRef.current?.blur();
    if (onSearch) {
      // An empty submit clears rather than doing nothing: emptying the field
      // and pressing search is how someone takes a search back off a list they
      // are looking at, and the alternative was a term you could only remove
      // from a chip somewhere else on the screen.
      seen.current = q;
      onSearch(q);
      return;
    }
    if (!q) return;
    router.push(`/m?${QUERY_PARAM}=${encodeURIComponent(q)}`);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4">
        {/* Holds the left side even on the tabs that have no sort switch, so
            the button sits in the same place on every tab rather than jumping
            when you change feeds. */}
        {leading ?? <span />}

        {/* No fill at all — the quietest thing this row can be.

            It was an orange disc, on the argument that it should read as the
            action beside a tan segmented control that reads as a setting. What
            that argument missed is what the row sits above: a feed of orange
            percentages. DESIGN.md gives the accent to ratings, selected states
            and the primary action, and on a screen already printing 90% in
            --pm-orange, one more orange fill stops meaning "press this" and
            starts being the third orange thing in view. The primary action on
            this screen is the nav's Post a plate button, which is orange and
            raised and should be the only one.

            So the glyph carries itself. --pm-grey-text is the muted step for
            the cream ground (zinc-500 is 4.28:1 here and fails), and it clears
            the 3:1 a non-text indicator owes with room over. 20px rather than
            the 18 it wore inside the disc: with no fill behind it the mark is
            the whole control, and at 18 it read as punctuation.

            Toggles to a close mark while the field is open instead of leaving
            a second dismiss control on the row. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close search" : "Search restaurants"}
          aria-expanded={open}
          /* Still 44px of hit area, which is now the whole element rather than
             transparent padding around a painted disc — the min-h-11 floor in
             AGENTS.md does not care that nothing is drawn on it. */
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-grey-text transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange motion-reduce:transition-none"
        >
          {open ? (
            <CloseIcon className="h-5 w-5" />
          ) : (
            <SearchGlyph className="h-5 w-5" />
          )}
        </button>
      </div>

      {open && (
        <form
          role="search"
          onSubmit={submit}
          className="mx-4 mt-2 flex items-center gap-2 rounded-full bg-white py-1 pl-4 pr-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange"
        >
          <SearchGlyph className="shrink-0 text-pm-grey-text" />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            enterKeyHint="search"
            autoComplete="off"
            placeholder={onSearch ? "Search plates, places, comments…" : "Search restaurants, cuisines…"}
            aria-label={onSearch ? "Search the feed" : "Search restaurants"}
            /* 16px, not the 14 the rest of this row would suggest: iOS Safari
               zooms the whole page in when a focused field sets below 16px,
               and a screen that jumps scale on a tap reads as a bug. */
            className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-zinc-900 placeholder:text-pm-grey-text focus:outline-none"
          />
        </form>
      )}
    </>
  );
}

/** The same glyph the header and `RestaurantSearch` inline — `components/icons`
    has no magnifier, and adding one there is a change to a shared file this
    component doesn't need to make. */
function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
