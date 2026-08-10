"use client";

import { useState } from "react";
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
  collapseAfter = COLLAPSED_ROWS,
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
  /** Override for a facet whose option set shouldn't be broken up. */
  collapseAfter?: number;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  // A selected option stays visible even when it sits past the fold, so the
  // rail never shows a filter as on without showing which one.
  const visible =
    expanded || options.length <= collapseAfter
      ? options
      : options
          .slice(0, collapseAfter)
          .concat(
            options.slice(collapseAfter).filter((o) => o.value === value),
          );
  const hidden = options.length - visible.length;
  // Gated on the list being long enough to collapse, not on anything currently
  // being hidden — `hidden` is 0 once expanded, which is exactly when the
  // control has to stay put to offer the way back.
  const collapsible = options.length > collapseAfter;

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="-mx-2">
        <FacetRow
          label={anyLabel}
          count={anyCount}
          selected={value === null}
          disabled={false}
          onSelect={() => onChange(null)}
        />
        {children}
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
              onSelect={() => onChange(selected ? null : option.value)}
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
