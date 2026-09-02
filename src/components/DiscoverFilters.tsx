"use client";

import { useId, useState } from "react";
import { BEST_AT } from "@/data/reviewScales";
import { PRICE_BANDS, type PriceBand } from "@/data/priceBands";
import {
  QUICK_FILTERS,
  activeFilterCount,
  type DiscoverFilters as Filters,
  type FacetCounts,
  type FacetOption,
  type QuickFilter,
} from "@/lib/discoverFilters";
import { NEARBY_RADIUS_MI, type NearbyState } from "@/lib/nearby";

/**
 * Facet lists open at this many rows; the rest are one tap away.
 *
 * Three, because the options are ordered by how many places they return, so
 * the top three are the ones most likely to be wanted — and five facets opened
 * to six rows each was a rail taller than the results beside it.
 */
const COLLAPSED_ROWS = 3;

/**
 * A facet gets a search field of its own from this many options up.
 *
 * Six, because below that the whole list already fits in one glance behind a
 * single "show more" tap, and a field costs a row of chrome plus a place for
 * the eye to stop. It clears Neighborhood and Cuisine — the two lists long
 * enough that scanning them is real work — and the eight categories under
 * "Rated well for". Price stays bare: four bands with a fixed cheap-to-dear
 * order are not something anyone would type at.
 */
const SEARCHABLE_FROM = 6;

export type FilterHandlers = {
  onNeighborhood: (v: string | null) => void;
  onNearby: () => void;
  onCuisine: (v: string | null) => void;
  onPrice: (v: PriceBand | null) => void;
  onAspect: (v: string | null) => void;
  onQuick: (v: QuickFilter) => void;
  onClear: () => void;
};

/** Everything the Nearby row needs to describe itself. */
export type NearbyProps = {
  state: NearbyState;
  /** Null until there are coordinates to measure from. */
  count: number | null;
};

const PRICE_HINTS = new Map(PRICE_BANDS.map((b) => [b.value as string, b.hint]));
const ASPECT_EMOJI = new Map(BEST_AT.map((b) => [b.label, b.emoji]));

/**
 * Uppercase mono, wide and small — the label is machine furniture, not
 * something a person wrote, and the type says so.
 */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
      {children}
    </p>
  );
}

/**
 * One facet row: the option on the left, what picking it would return on the
 * right.
 *
 * Selection is an orange rule under the label, not an orange row. Filling the
 * whole row put a saturated block behind three or four words of small type and
 * made the rail shout louder than the results it was filtering — with five
 * facets on screen, several selected at once, the accent stopped meaning
 * anything. Underlining marks the same state with a fraction of the ink.
 *
 * The bar is drawn as a bottom border that is always present and merely
 * changes colour, so selecting a row can't shift the text by two pixels.
 *
 * `hint` is the quiet middle column — a price range, a radius. It sits in the
 * prose sans rather than the mono because it's a phrase, not a value; the
 * count on the right is the number here.
 */
function FacetRow({
  label,
  emoji,
  hint,
  monoLabel,
  count,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  emoji?: string;
  hint?: string;
  /**
   * For rows whose label *and* hint are machine values rather than words —
   * the price bands, where both the `$$` and the `$12–20` behind it are
   * money and DESIGN.md puts every price in the mono.
   */
  monoLabel?: boolean;
  /** Null prints nothing — for a count that can't be known yet. */
  count: number | null;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex min-h-9 w-full items-center gap-2 rounded-full px-2.5 text-left text-[13px] transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange ${
        selected
          ? "font-medium text-zinc-900"
          : disabled
            ? "text-zinc-400"
            : "text-zinc-700 hover:bg-pm-grey-tint/60 hover:text-zinc-900"
      }`}
    >
      {emoji && (
        <span className="shrink-0 text-[11px] leading-none" aria-hidden="true">
          {emoji}
        </span>
      )}
      {/* The bar sits under the label alone rather than the full row: it marks
          the word you chose, and a rule running the width of the rail would
          read as a divider between rows instead. */}
      <span
        className={`truncate border-b-2 pb-px ${
          monoLabel ? "font-mono tracking-tight" : ""
        } ${selected ? "border-pm-orange" : "border-transparent"}`}
      >
        {label}
      </span>
      {hint && (
        <span
          className={`ml-auto shrink-0 text-[11px] ${
            monoLabel ? "font-mono tabular-nums" : ""
          } text-zinc-400`}
        >
          {hint}
        </span>
      )}
      {/* The count carries the accent as small type, which is what
          --pm-orange-text exists for — the fill token is too light to read at
          11px on white. */}
      <span
        className={`shrink-0 font-mono text-[11px] tabular-nums ${hint ? "" : "ml-auto"} ${
          selected
            ? "text-pm-orange-text"
            : disabled
              ? "text-zinc-400"
              : "text-zinc-500"
        }`}
      >
        {count ?? ""}
      </span>
    </button>
  );
}

/**
 * The per-facet search field: types down the list below it, nothing else.
 *
 * It filters options that are already on the page rather than querying
 * anything, so there is no debounce, no request and no loading state — the
 * whole option set for a facet is a couple of dozen strings the rail was
 * handed at render.
 *
 * Shaped as a tinted pill rather than a bordered box: DESIGN.md gives the rail
 * a white card with no outlines inside it, and a tan track is how the rest of
 * this UI marks something you act on within a card.
 */
function FacetSearch({
  noun,
  query,
  onQuery,
}: {
  /** Plural, lowercase — "neighborhoods". Both the label and the prompt. */
  noun: string;
  query: string;
  onQuery: (next: string) => void;
}) {
  const id = useId();

  return (
    <div className="mb-1 flex items-center gap-1.5 rounded-full bg-pm-grey-tint/60 px-2.5 transition-colors focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-pm-orange">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        className="shrink-0 text-zinc-400"
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
        // Escape empties the field first and only reaches the mobile sheet's
        // own Escape handler once there is nothing left to clear — losing a
        // half-typed word is cheap, losing every filter you had picked is not.
        //
        // stopImmediatePropagation, not stopPropagation: under the App Router
        // React delegates to the document, which is also where Dialog listens,
        // so both handlers sit on the same node and only the immediate form
        // stops the second one. Verified in the sheet, not assumed.
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.nativeEvent.stopImmediatePropagation();
            onQuery("");
          }
        }}
        placeholder={`Search ${noun}`}
        autoComplete="off"
        // 13px matches the rows below; on a touch device it goes back up to
        // 16px, under which iOS zooms the page in on focus and leaves the
        // visitor scrolled sideways inside the filter sheet.
        className="min-h-8 w-full min-w-0 bg-transparent text-[13px] text-zinc-900 placeholder:text-zinc-500 focus:outline-none pointer-coarse:min-h-11 pointer-coarse:text-base"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQuery("")}
          aria-label={`Clear ${noun} search`}
          className="-mr-1 shrink-0 rounded-full p-1 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pm-orange"
        >
          <svg
            width="12"
            height="12"
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

function Facet({
  label,
  anyLabel,
  options,
  counts,
  anyCount,
  value,
  onChange,
  hints,
  emoji,
  monoLabels,
  searchNoun,
  collapseAfter = COLLAPSED_ROWS,
  childLabel,
  /** Rendered directly under the "any" row — the Nearby row lives here. */
  children,
}: {
  label: string;
  anyLabel: string;
  options: readonly FacetOption[];
  counts: Map<string, number>;
  anyCount: number;
  value: string | null;
  onChange: (next: string | null) => void;
  hints?: Map<string, string>;
  emoji?: Map<string, string>;
  monoLabels?: boolean;
  /**
   * What this facet's options are, plural and lowercase. Supplying it offers a
   * search field once the list is long enough to want one (SEARCHABLE_FROM);
   * a facet with no noun never gets one.
   */
  searchNoun?: string;
  /** Override for a facet whose option set shouldn't be broken up. */
  collapseAfter?: number;
  /**
   * The label of the row passed as `children`, so search can find it. Without
   * it a searched list simply drops that row, which is right for a row search
   * can't read.
   */
  childLabel?: string;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  // An option returning nothing is dropped rather than greyed. It used to be
  // rendered disabled, which reads as "there are Ethiopian places, just not
  // here" — but under a neighbourhood filter that is most of the list, and a
  // facet whose rows are mostly dead is a list to scroll past rather than
  // choose from. The count already says how many; a row saying zero adds a
  // line and no information.
  //
  // The one exception is the option currently on. Hiding that would strand
  // the visitor in a combination with nothing on screen to undo — the same
  // reason `disabled` spared it before.
  //
  // Computed before `searchable` on purpose: the fold and the search field
  // both size the list for the visitor, and both should count rows that are
  // actually there.
  const live = options.filter((o) => (counts.get(o.value) ?? 0) > 0 || o.value === value);

  const searchable = searchNoun !== undefined && live.length >= SEARCHABLE_FROM;
  const q = searchable ? query.trim().toLowerCase() : "";

  // While searching, the list is the matches and nothing else: the fold, the
  // "any" row and Nearby all stand down, because a list answering a typed
  // question shouldn't also carry rows that didn't answer it. Everything comes
  // back the moment the field is empty — the query is a lens over the list, not
  // a filter that has been applied.
  //
  // A selected option stays visible even when it sits past the fold, so the
  // rail never shows a filter as on without showing which one.
  const visible = q
    ? live.filter((o) => o.value.toLowerCase().includes(q))
    : expanded || live.length <= collapseAfter
      ? live
      : live
          .slice(0, collapseAfter)
          .concat(live.slice(collapseAfter).filter((o) => o.value === value));
  const hidden = live.length - visible.length;
  // Gated on the list being long enough to collapse, not on anything currently
  // being hidden — `hidden` is 0 once expanded, which is exactly when the
  // control has to stay put to offer the way back.
  const collapsible = !q && live.length > collapseAfter;
  const showChild = !q || (childLabel?.toLowerCase().includes(q) ?? false);

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {searchable && (
        <FacetSearch noun={searchNoun} query={query} onQuery={setQuery} />
      )}
      <div className="-mx-2">
        {!q && (
          <FacetRow
            label={anyLabel}
            count={anyCount}
            selected={value === null}
            disabled={false}
            onSelect={() => onChange(null)}
          />
        )}
        {showChild && children}
        {q && visible.length === 0 && !showChild && (
          <p role="status" className="px-2.5 py-1.5 text-[12px] leading-snug text-zinc-500">
            No {searchNoun} matching &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
        {visible.map((option) => {
          const count = counts.get(option.value) ?? 0;
          const selected = option.value === value;
          return (
            <FacetRow
              key={option.value}
              label={option.value}
              emoji={emoji?.get(option.value)}
              hint={hints?.get(option.value)}
              monoLabel={monoLabels}
              count={count}
              selected={selected}
              // Never disable the option that is on — that would strand the
              // user inside a combination they can't back out of.
              disabled={count === 0 && !selected}
              // Picking ends the search. The choice is made, so the list goes
              // back to showing it among the alternatives rather than among
              // the letters that found it — and a stale query left in the
              // field would keep the "any" row hidden behind it.
              onSelect={() => {
                setQuery("");
                onChange(selected ? null : option.value);
              }}
            />
          );
        })}
        {/* Sits in the list as another row, with the same geometry and hover
            as the options above it — it belongs to the list rather than
            capping it. The small uppercase mono is the one thing setting it
            apart, which is right: it's a control, not a value you can pick. */}
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex min-h-9 w-full items-center rounded-full px-2.5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 transition-colors hover:bg-pm-grey-tint/60 hover:text-zinc-900 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-orange"
          >
            {expanded ? "Show fewer" : `Show ${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Nearby" as a row inside the neighbourhood list, because it answers the same
 * question — where — and picking it should replace a neighbourhood rather than
 * narrow one. The permission prompt only goes up when this is tapped; see the
 * note in lib/nearby.ts about spending that one chance well.
 */
function NearbyRow({
  on,
  state,
  count,
  onSelect,
}: {
  on: boolean;
  state: NearbyState;
  count: number | null;
  onSelect: () => void;
}) {
  if (state === "unsupported") return null;

  const hint =
    state === "locating"
      ? "locating…"
      : state === "denied"
        ? "blocked"
        : state === "failed"
          ? "unavailable"
          : `within ${NEARBY_RADIUS_MI} mi`;

  return (
    <>
      <FacetRow
        label="Nearby"
        hint={hint}
        count={count}
        selected={on}
        disabled={false}
        onSelect={onSelect}
      />
      {/* Only after a refusal, and only as a sentence — a browser permission
          can't be re-prompted from here, so the honest thing is to say where
          it now lives rather than offer a button that would do nothing. */}
      {on && state === "denied" && (
        <p role="status" className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-zinc-500">
          Location is blocked for this site. Allow it in your browser settings to
          filter by distance.
        </p>
      )}
      {on && state === "failed" && (
        <p role="status" className="px-2.5 pb-1 pt-0.5 text-[11px] leading-snug text-zinc-500">
          Couldn&rsquo;t get your location. Tap Nearby again to retry.
        </p>
      )}
    </>
  );
}

/**
 * The quick toggles keep a shape of their own — bordered, side by side — so
 * they don't read as more rows in the single-select lists above them. They
 * combine; the lists replace.
 */
export function QuickFilterChips({
  quick,
  counts,
  onQuick,
}: {
  quick: QuickFilter[];
  counts: Record<QuickFilter, number>;
  onQuick: (v: QuickFilter) => void;
}) {
  return (
    <>
      {QUICK_FILTERS.map((f) => {
        const on = quick.includes(f.value);
        const count = counts[f.value];
        const disabled = count === 0 && !on;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onQuick(f.value)}
            disabled={disabled}
            aria-pressed={on}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
              on
                ? "bg-pm-orange font-medium text-[#F7F4EC]"
                : disabled
                  ? "bg-pm-grey-tint/50 text-zinc-400"
                  : "bg-pm-grey-tint text-pm-grey-text hover:text-zinc-900"
            }`}
          >
            {f.label}
            <span
              className={`font-mono text-[11px] tabular-nums ${
                on ? "text-[#F7F4EC]/80" : "text-zinc-500"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * The controls themselves, with no container of their own — the desktop rail
 * and the mobile sheet each supply their own.
 */
export function FilterControls({
  filters,
  counts,
  neighborhoods,
  cuisines,
  prices,
  aspects,
  nearby,
  onNeighborhood,
  onNearby,
  onCuisine,
  onPrice,
  onAspect,
  onQuick,
}: {
  filters: Filters;
  counts: FacetCounts;
  neighborhoods: readonly FacetOption[];
  cuisines: readonly FacetOption[];
  prices: readonly FacetOption[];
  aspects: readonly FacetOption[];
  nearby: NearbyProps;
} & Omit<FilterHandlers, "onClear">) {
  return (
    <div className="flex flex-col gap-5">
      <Facet
        label="Neighborhood"
        anyLabel="Anywhere"
        options={neighborhoods}
        counts={counts.neighborhood}
        anyCount={counts.anyNeighborhood}
        value={filters.nearby ? "" : filters.neighborhood}
        onChange={onNeighborhood}
        searchNoun="neighborhoods"
        childLabel="Nearby"
      >
        <NearbyRow
          on={filters.nearby}
          state={nearby.state}
          count={counts.nearby}
          onSelect={onNearby}
        />
      </Facet>
      <Facet
        label="Cuisine"
        anyLabel="Any cuisine"
        options={cuisines}
        counts={counts.cuisine}
        anyCount={counts.anyCuisine}
        value={filters.cuisine}
        onChange={onCuisine}
        searchNoun="cuisines"
      />
      {/* Priced from the menu prices the app already shows, so places without
          a menu carry no band and no price filter can return them — hence a
          `$`+`$$`+`$$$`+`$$$$` that doesn't add up to "Any price". */}
      <Facet
        label="Price"
        anyLabel="Any price"
        options={prices}
        counts={counts.price}
        anyCount={counts.anyPrice}
        value={filters.price}
        onChange={(v) => onPrice(v as PriceBand | null)}
        hints={PRICE_HINTS}
        monoLabels
        // Kept whole. Collapsing four bands to three would hide one row behind
        // a row, saving nothing, and a money scale missing its top step reads
        // as though the expensive places aren't there.
        collapseAfter={PRICE_BANDS.length}
      />
      <Facet
        label="Rated well for"
        anyLabel="Any category"
        options={aspects}
        counts={counts.aspect}
        anyCount={counts.anyAspect}
        value={filters.aspect}
        onChange={onAspect}
        emoji={ASPECT_EMOJI}
        searchNoun="categories"
      />
      <div>
        <SectionLabel>Quick filters</SectionLabel>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <QuickFilterChips quick={filters.quick} counts={counts.quick} onQuick={onQuick} />
        </div>
      </div>
    </div>
  );
}

/** Desktop rail. Below `lg` the same controls live in the filter sheet. */
export function FilterRail({
  filters,
  counts,
  neighborhoods,
  cuisines,
  prices,
  aspects,
  nearby,
  onNeighborhood,
  onNearby,
  onCuisine,
  onPrice,
  onAspect,
  onQuick,
  onClear,
}: {
  filters: Filters;
  counts: FacetCounts;
  neighborhoods: readonly FacetOption[];
  cuisines: readonly FacetOption[];
  prices: readonly FacetOption[];
  aspects: readonly FacetOption[];
  nearby: NearbyProps;
} & FilterHandlers) {
  const active = activeFilterCount(filters);

  /* A white card on the cream, like every other grouping.
   *
   * `h-fit` keeps the card from stretching to the flex row's full height, but
   * on its own it lets the rail grow past the bottom of the screen — and
   * because the card is `sticky`, whatever hangs below the viewport can never
   * be scrolled to. Expanding a couple of "show more" sections is enough to
   * put Quick filters out of reach. So the height is capped to the viewport
   * (minus the 1.5rem `top-6` offset, twice, for equal breathing room top and
   * bottom) and the overflow scrolls inside the card instead.
   *
   * `overscroll-contain` stops a scroll that reaches the end of the rail from
   * chaining to the results grid behind it. */
  return (
    <aside className="hidden w-[230px] shrink-0 rounded-2xl bg-white p-4 lg:sticky lg:top-6 lg:block lg:h-fit lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:overscroll-contain">
      <div className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Filters
        </p>
        {active > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-1 py-0.5 text-xs text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Clear
          </button>
        )}
      </div>

      <FilterControls
        filters={filters}
        counts={counts}
        neighborhoods={neighborhoods}
        cuisines={cuisines}
        prices={prices}
        aspects={aspects}
        nearby={nearby}
        onNeighborhood={onNeighborhood}
        onNearby={onNearby}
        onCuisine={onCuisine}
        onPrice={onPrice}
        onAspect={onAspect}
        onQuick={onQuick}
      />
    </aside>
  );
}
