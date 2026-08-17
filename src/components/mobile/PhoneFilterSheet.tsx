"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { PRICE_BANDS } from "@/data/priceBands";
import { BEST_AT } from "@/data/reviewScales";

/**
 * Every filter dimension the web rail offers, as a phone bottom sheet.
 *
 * ## It is handed URLs, not callbacks
 *
 * Filtering is a navigation in this app — the URL is the query (see the
 * architecture comment in lib/discover.ts) — so every row here is a `Link`, and
 * every one of those links was built by `hrefWith` in src/app/m/page.tsx. That
 * is deliberate and it is the reason this file has no idea what a query
 * parameter is called: one place owns the round trip, so `?nav=` survives every
 * tap and the URL a phone produces is the same URL the desktop rail produces.
 *
 * ## Why the rows navigate one at a time
 *
 * The alternative — accumulate selections locally, navigate once from a
 * "Show N places" button — reads better on a phone right up until the button
 * has to print N. The only honest source for that number is `page.counts`,
 * which counts each dimension against the *applied* filters with its own
 * dimension cleared. It can answer "what would picking North Park return", it
 * cannot answer "what would North Park AND $$ AND open now return" without
 * re-running the predicate, which is server work. A button promising a count it
 * derived from the wrong baseline is worse than one more round trip, so every
 * row navigates and every count on screen is one the server just computed.
 *
 * The sheet survives those navigations: it is a client component in a fixed
 * position in the tree, so a soft navigation re-renders the page around it and
 * leaves its state — open, scrolled, half-typed search — alone. Same mechanism
 * the web sheet relies on (see DiscoverBrowser).
 *
 * ## Why it is not `Dialog`
 *
 * Dialog's `sheet` variant is bottom-anchored below `sm` and a centred card
 * above it. In this tree that breakpoint reads the *desktop window*, not the
 * 390px frame the phone version is drawn inside (see the device-frame block in
 * m/phone.css), so on a laptop the filter sheet would render as a floating
 * rounded card in the middle of the phone. Every `Phone*` sheet has to be
 * breakpoint-free for that reason; this one follows DishSheet's shell and
 * Dialog's behaviour.
 */

export type PhoneFilterOption = {
  value: string;
  /** What picking it would return, from page.counts — never computed here. */
  count: number;
  selected: boolean;
  /** Selects it, or clears it when it is already the one on. */
  href: string;
};

export type PhoneFilterGroup = {
  /** Drives the decoration below — price hints, category emoji. */
  key: "neighborhood" | "cuisine" | "price" | "aspect";
  label: string;
  /** The clear-this-dimension row: "Anywhere", "Any cuisine". */
  anyLabel: string;
  any: { count: number; selected: boolean; href: string };
  options: PhoneFilterOption[];
  /**
   * Plural and lowercase — "neighborhoods". Supplying it offers a search field
   * once the list is long enough to want one.
   */
  searchNoun?: string;
};

export type PhoneQuickFilter = {
  value: string;
  label: string;
  count: number;
  on: boolean;
  href: string;
};

export type PhoneFilterChip = {
  key: string;
  label: string;
  /** A machine value — the price band. Set in mono. */
  mono?: boolean;
  removeHref: string;
};

export type PhoneFilterModel = {
  /** activeFilterCount(page.filters) — what the rail chip prints. */
  active: number;
  /** page.total: the real size of the current result set. */
  total: number;
  clearHref: string;
  neighborhood: PhoneFilterGroup;
  cuisine: PhoneFilterGroup;
  price: PhoneFilterGroup;
  aspect: PhoneFilterGroup;
  quick: PhoneQuickFilter[];
  /**
   * Everything active except cuisine, as removable chips for the rail — cuisine
   * already shows as the lit chip in the rail itself.
   */
  chips: PhoneFilterChip[];
};

/**
 * Rows shown before the fold. Six rather than the rail's three: a sheet opens
 * to most of the screen and can afford them, and cuisine alone runs to dozens
 * of options — a fold that tight would put "show more" in front of everything.
 */
const COLLAPSED_ROWS = 6;

/** A facet earns a search field from this many options up. Same bar as the web rail. */
const SEARCHABLE_FROM = 6;

const PRICE_HINTS = new Map(PRICE_BANDS.map((b) => [b.value as string, b.hint]));
const ASPECT_EMOJI = new Map(BEST_AT.map((b) => [b.label, b.emoji]));

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * One option.
 *
 * Selection is an orange rule under the label rather than an orange row —
 * the same mark the web rail uses, for the same reason: five facets of filled
 * rows makes the sheet shout louder than the results behind it. The bar is
 * always drawn and only changes colour, so selecting cannot shift the text.
 *
 * An option returning nothing renders as text rather than a link. There is no
 * disabled state for a link, and the web rail's answer — a row you can press
 * into an empty grid — is worse on a phone, where the empty grid is a whole
 * screen away.
 */
function FacetRow({
  label,
  href,
  count,
  selected,
  emoji,
  hint,
  mono,
  onPick,
}: {
  label: string;
  href: string;
  count: number;
  selected: boolean;
  emoji?: string;
  hint?: string;
  mono?: boolean;
  /** Fires alongside the navigation — the facet uses it to end its search. */
  onPick?: () => void;
}) {
  const dead = count === 0 && !selected;

  const body = (
    <>
      {emoji && (
        <span className="shrink-0 text-[13px] leading-none" aria-hidden="true">
          {emoji}
        </span>
      )}
      <span
        className={`min-w-0 truncate border-b-2 pb-px ${mono ? "font-mono tracking-tight" : ""} ${
          selected ? "border-pm-orange" : "border-transparent"
        }`}
      >
        {label}
      </span>
      {hint && (
        <span className="ml-auto mr-1 shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
          {hint}
        </span>
      )}
      {/* Every number is mono, and the accent is what marks the count of the
          row you are standing on. --pm-orange-text, not --pm-orange: this is
          small type. Right-aligned in a fixed gutter so the counts read as a
          column rather than trailing whatever length the label happened to be. */}
      <span
        className={`w-9 shrink-0 text-right font-mono text-[12px] tabular-nums ${
          hint ? "" : "ml-auto"
        } ${selected ? "text-pm-orange-text" : "text-zinc-500"}`}
      >
        {count}
      </span>
    </>
  );

  const shape =
    "flex min-h-11 w-full items-center gap-2 rounded-full px-3 text-left text-[15px]";

  if (dead) {
    return (
      <span aria-disabled="true" className={`${shape} text-zinc-500`}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={href}
      // The page under the sheet must not jump to the top while the sheet is
      // covering it — the scroll position is where the visitor left the list.
      scroll={false}
      // A sheet holds thirty-odd links to permutations of a dynamic page.
      // Prefetching them all on open is thirty RSC requests to answer one tap.
      prefetch={false}
      onClick={onPick}
      aria-current={selected ? "true" : undefined}
      className={`${shape} transition-colors active:bg-pm-grey-tint/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
        selected ? "font-medium text-zinc-900" : "text-zinc-800"
      }`}
    >
      {body}
    </Link>
  );
}

/**
 * The per-facet search field: types down the list below it and nothing else.
 *
 * No request, no debounce, no loading state — the whole option set arrived with
 * the page, and this is a lens over it. 16px is not a taste call: iOS zooms the
 * page in on focus for anything smaller, which would leave the visitor scrolled
 * sideways inside a sheet.
 */
function FacetSearch({
  noun,
  query,
  onQuery,
}: {
  noun: string;
  query: string;
  onQuery: (next: string) => void;
}) {
  const id = useId();

  return (
    <div className="mb-1 flex items-center gap-2 rounded-full bg-pm-grey-tint/70 px-3 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-pm-orange">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        className="shrink-0 text-zinc-500"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <label htmlFor={id} className="sr-only">
        Search {noun}
      </label>
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        // Escape empties the field first and only reaches the sheet's own
        // Escape once there is nothing left to clear. stopImmediatePropagation
        // rather than stopPropagation: React delegates to the document, which
        // is where the sheet listens too, so both handlers sit on the same node
        // and only the immediate form stops the second one.
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.nativeEvent.stopImmediatePropagation();
            onQuery("");
          }
        }}
        placeholder={`Search ${noun}`}
        autoComplete="off"
        className="min-h-11 w-full min-w-0 bg-transparent text-base text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label={`Clear ${noun} search`}
          className="-mr-1.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pm-orange"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Facet({ group }: { group: PhoneFilterGroup }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const searchable = group.searchNoun !== undefined && group.options.length >= SEARCHABLE_FROM;
  const q = searchable ? query.trim().toLowerCase() : "";

  // While searching the list is the matches and nothing else — the fold and the
  // "any" row stand down, because a list answering a typed question should not
  // also carry rows that did not answer it. A selected option past the fold
  // stays visible, so the sheet never shows a filter as on without showing
  // which one.
  const visible = q
    ? group.options.filter((o) => o.value.toLowerCase().includes(q))
    : expanded || group.options.length <= COLLAPSED_ROWS
      ? group.options
      : group.options
          .slice(0, COLLAPSED_ROWS)
          .concat(group.options.slice(COLLAPSED_ROWS).filter((o) => o.selected));

  const hidden = group.options.length - visible.length;
  // Gated on the list being long enough to collapse rather than on anything
  // currently being hidden: once expanded, `hidden` is 0 and that is exactly
  // when the control has to stay put to offer the way back.
  const collapsible = !q && group.options.length > COLLAPSED_ROWS;

  return (
    <section>
      <p className="mono-label mb-1.5 text-zinc-500">{group.label}</p>
      {searchable && (
        <FacetSearch noun={group.searchNoun!} query={query} onQuery={setQuery} />
      )}
      <div className="-mx-3">
        {!q && (
          <FacetRow
            label={group.anyLabel}
            href={group.any.href}
            count={group.any.count}
            selected={group.any.selected}
          />
        )}
        {q && visible.length === 0 && (
          <p role="status" className="px-3 py-2 text-[13px] leading-snug text-zinc-500">
            No {group.searchNoun} matching {`“${query.trim()}”`}.
          </p>
        )}
        {visible.map((option) => (
          <FacetRow
            key={option.value}
            label={option.value}
            href={option.href}
            count={option.count}
            selected={option.selected}
            emoji={group.key === "aspect" ? ASPECT_EMOJI.get(option.value) : undefined}
            hint={group.key === "price" ? PRICE_HINTS.get(option.value) : undefined}
            mono={group.key === "price"}
            // Picking ends the search: the choice is made, so the list goes back
            // to showing it among the alternatives rather than among the letters
            // that found it — and a stale query would keep the "any" row hidden
            // behind it.
            onPick={() => setQuery("")}
          />
        ))}
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex min-h-11 w-full items-center rounded-full px-3 text-left font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
          >
            {expanded ? "Show fewer" : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}

export function PhoneFilterSheet({
  model,
  onClose,
}: {
  model: PhoneFilterModel;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const headingId = useId();

  // Escape, focus moved in and restored, Tab kept inside, background scroll
  // locked — the same contract Dialog owns for the web overlays. Copied rather
  // than imported because Dialog's chrome is breakpoint-aware and this tree
  // cannot use breakpoints (see the header comment).
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const restore = restoreRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      /* `overflow-hidden` is load-bearing, not tidiness. In the desktop phone
         frame the shell is transformed, which makes it the containing block for
         this fixed overlay — and the panel's overflow then propagates into the
         *shell's* scrollable area, giving a frame that is meant to be exactly
         one viewport tall 741px of hidden scroll. Chrome will happily scroll an
         `overflow: hidden` box to reveal a focused input, and scrolling the
         containing block drags this sheet up off the bottom edge with it: focus
         the neighbourhood search and the sheet visibly detaches. Clipping the
         scrim leaves the shell unscrollable, which is what it is meant to be. */
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-pm-charcoal/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* White, not the dish sheet's cream: this one holds rows rather than
          cards, and rows want the surface that lets zinc-500 carry the counts
          at 4.5:1. Capped short of the frame so the list behind it stays
          visible as the thing being filtered. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="animate-sheet-in flex max-h-[86dvh] w-full flex-col rounded-t-2xl bg-white"
      >
        <div className="shrink-0 px-4 pb-1 pt-2.5">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
          <div className="mt-1.5 flex items-center gap-2">
            <h2 id={headingId} className="font-display text-lg font-semibold text-zinc-900">
              Filters
            </h2>
            {model.active > 0 && (
              <span className="font-mono text-xs tabular-nums text-pm-orange-text">
                {model.active}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close filters"
              className="-mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
          {/* Nearby is deliberately absent: it needs coordinates, and
              coordinates travel in a POST body rather than the URL (see
              lib/discover.ts). This screen is rendered from the URL alone, so a
              Nearby row here would light up and filter nothing. */}
          <Facet group={model.neighborhood} />
          <Facet group={model.cuisine} />
          <Facet group={model.price} />
          <Facet group={model.aspect} />

          <section>
            <p className="mono-label mb-2 text-zinc-500">Quick filters</p>
            {/* Pills, where the lists above are rows: these combine, the lists
                replace, and the two should not read as one menu. */}
            <div className="flex flex-wrap gap-2">
              {model.quick.map((f) => {
                const dead = f.count === 0 && !f.on;
                const shape =
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px]";
                if (dead) {
                  return (
                    <span
                      key={f.value}
                      aria-disabled="true"
                      className={`${shape} bg-pm-grey-tint/50 text-zinc-500`}
                    >
                      {f.label}
                      <span className="font-mono text-[11px] tabular-nums">{f.count}</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={f.value}
                    href={f.href}
                    scroll={false}
                    prefetch={false}
                    aria-current={f.on ? "true" : undefined}
                    className={`${shape} transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                      f.on
                        ? "bg-pm-orange font-medium text-[#F7F4EC]"
                        : "bg-pm-grey-tint text-pm-grey-text"
                    }`}
                  >
                    {f.label}
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        f.on ? "text-[#F7F4EC]" : "text-zinc-500"
                      }`}
                    >
                      {f.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        {/* The count on the button is page.total — the result set that already
            exists behind the sheet, not a prediction. */}
        <div className="flex shrink-0 items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {model.active > 0 && (
            <Link
              href={model.clearHref}
              scroll={false}
              prefetch={false}
              className="flex min-h-11 shrink-0 items-center rounded-full px-2 text-[13px] text-zinc-600 underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Clear all
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded-full bg-pm-orange text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Show{" "}
            <span className="font-mono tabular-nums">{model.total.toLocaleString()}</span>{" "}
            {model.total === 1 ? "place" : "places"}
          </button>
        </div>
      </div>
    </div>
  );
}
