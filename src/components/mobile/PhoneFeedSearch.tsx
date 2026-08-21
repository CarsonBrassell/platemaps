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
 * instead, and a submit filters the list already on screen to posts about that
 * restaurant — a different question ("who said what about Ballast Point") than
 * Discover answers ("show me Ballast Point"). The map tab gets no `onSearch`,
 * so it keeps the navigate-to-Discover behavior; there's no scrollable list on
 * that tab to filter.
 *
 * There is deliberately **no typeahead**: the dropdown is the part of
 * `RestaurantSearch` that needs a per-keystroke request and a second set of
 * routes, and neither is worth inventing when the destination screen answers
 * the same question with counts and filters.
 *
 * ## `placement="map"` is the fourth place, and it is map-only
 *
 * The map tab has no row for this to sit in any more — the map runs to the top
 * of the screen and the tabs float on it, so there is no cream strip left. So
 * on that tab the control goes to the bottom-right corner, mirroring the
 * Discover/Friends switch in the bottom-left and wearing the same clothes: the
 * translucent near-black glass that reads as part of the tiles rather than as a
 * cream-world chip dropped on them.
 *
 * The bottom-right objection in the list above was about the *card* tabs, and
 * it still stands there — a disc pinned over a scrolling feed covers the
 * bottom-right corner of whatever card is under it, which is where that card
 * keeps its own controls. A map has no cards. Nothing is covered but tiles, the
 * corner is the easiest point on the screen for a thumb, and the switch already
 * proved the bottom band is the right band for map chrome. So the card tabs keep
 * the sort-row placement and only the map moves.
 *
 * Two shape departures from the row version, both asked for:
 *
 * - **It is a bar, not a disc.** Closed, it says "Search" beside the glyph
 *   instead of being a mystery circle, which is what a control floating over a
 *   map has to do — there is no adjacent label to borrow meaning from.
 * - **Squared, not a pill.** DESIGN.md's "pills everywhere" is the cream
 *   world's rule; on the tiles the pill would be the third rounded-full capsule
 *   in the bottom band (switch, nav, this) and they would read as one menu
 *   broken into pieces. `rounded-lg` separates it from the switch it is paired
 *   with while the shared glass keeps them a pair.
 *
 * Open, the field takes a full-width bar on the row *above* the bottom
 * controls rather than expanding in place — expanding in place would put the
 * field on top of the source switch, and covering a control is worse than
 * spending a row that only exists while you are typing.
 */
export function PhoneFeedSearch({
  /** Rendered at the left of the control row — the sort switch, when there is one. */
  leading,
  /** When set, a submit calls this instead of navigating to Discover. */
  onSearch,
  /**
   * `row` sits under the feed tabs on the cream ground; `map` floats in the
   * bottom-right of the map on dark glass. See the note above.
   */
  placement = "row",
}: {
  leading?: ReactNode;
  onSearch?: (term: string) => void;
  placement?: "row" | "map";
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /* Focus follows the disclosure — a field that appears and does not take the
     caret costs a second tap on a phone, where the keyboard is the point. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    inputRef.current?.blur();
    if (onSearch) {
      onSearch(q);
      return;
    }
    router.push(`/m?${QUERY_PARAM}=${encodeURIComponent(q)}`);
  }

  /*
   * The map's corner control. Positioned against the map wrapper, which is why
   * this branch returns bare `absolute` boxes rather than anything with a
   * layout of its own — PhoneFeedScreen renders it as a sibling of the map
   * inside that wrapper, the same way PhoneFeedMapPanel pins the source switch.
   *
   * The two bottom offsets are one layout and move together: the button sits on
   * the switch's line (`--phone-nav-space` + 4px, the number the switch uses),
   * and the open field sits one 52px row plus an 8px gap above it. Both
   * controls are 52px tall so the bottom band reads as one line rather than two
   * things that nearly agree.
   */
  if (placement === "map") {
    return (
      <>
        {open && (
          <form
            role="search"
            onSubmit={submit}
            className="absolute inset-x-4 bottom-[calc(var(--phone-nav-space)+4rem)] z-10 flex items-center gap-2 rounded-lg bg-black/65 py-1 pl-3 pr-2 backdrop-blur-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pm-orange"
          >
            <SearchGlyph className="shrink-0 text-[#d3dae1]" />
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
              placeholder="Search restaurants, cuisines…"
              aria-label="Search restaurants"
              /* 16px for the same reason the row version is: iOS Safari zooms
                 the page in on a focused field set below it. */
              className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-[#F7F4EC] placeholder:text-[#9aa3ac] focus:outline-none"
            />
          </form>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close search" : "Search restaurants"}
          aria-expanded={open}
          /* `black/55` where the source switch uses `black/45`, and the ten
             points are not a colour choice — they are what keeps this reading
             as the switch's peer. The switch sits in the bottom-LEFT, which on
             this map is tiles; the bottom-right is where the densest run of
             bubbles lands, and `backdrop-blur` over a white bubble lifts a /45
             glass to a mid grey while the switch stays near-black. At /55 the
             two are indistinguishable over tiles and this one still holds its
             value when a card slides under it. */
          className="absolute right-4 bottom-[calc(var(--phone-nav-space)+0.25rem)] z-10 inline-flex min-h-[3.25rem] items-center gap-2 rounded-lg bg-black/55 px-3.5 text-[13px] font-medium text-[#d3dae1] backdrop-blur-md transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange motion-reduce:transition-none"
        >
          {open ? <CloseIcon className="h-[18px] w-[18px]" /> : <SearchGlyph />}
          {open ? "Close" : "Search"}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4">
        {/* Holds the left side even on the tabs that have no sort switch, so
            the button sits in the same place on every tab rather than jumping
            when you change feeds. */}
        {leading ?? <span />}

        {/* The one filled shape on this row, which is the point: it reads as
            the action beside a tan segmented control that reads as a setting.
            Cream glyph rather than white — #F7F4EC on --pm-orange is the
            pairing DESIGN.md names, and a glyph is a large mark, not a
            label-sized line. Toggles to a close mark while the field is open
            instead of leaving a second dismiss control on the row. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close search" : "Search restaurants"}
          aria-expanded={open}
          /* 44px of hit area around a 36px disc. The disc is sized to the
             sort switch beside it — a 44px fill next to a 32px segmented
             track reads as a third rank of control rather than a peer — but
             the target itself has to clear the min-h-11 floor in AGENTS.md,
             so the box is transparent and only the span is painted. */
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange motion-reduce:transition-none"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC]">
            {open ? <CloseIcon className="h-[18px] w-[18px]" /> : <SearchGlyph />}
          </span>
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
            placeholder="Search restaurants, cuisines…"
            aria-label="Search restaurants"
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
