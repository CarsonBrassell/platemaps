import Link from "next/link";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { PhoneFilterBar } from "@/components/mobile/PhoneFilterBar";
import type {
  PhoneFilterChip,
  PhoneFilterGroup,
  PhoneFilterModel,
} from "@/components/mobile/PhoneFilterSheet";
import { PhoneLayoutToggle, type PhoneLayoutOption } from "@/components/mobile/PhoneLayoutToggle";
import { PhoneRestaurantCard } from "@/components/mobile/PhoneRestaurantCard";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import { PhoneRestaurantCardTiny } from "@/components/mobile/PhoneRestaurantCardTiny";
import { getDiscoverPage, parseShown, PAGE_SIZE } from "@/lib/discover";
import {
  QUICK_FILTERS,
  activeFilterCount,
  type FacetOption,
} from "@/lib/discoverFilters";

/**
 * Discover, phone version.
 *
 * Reads exactly what the web `/` reads — `getDiscoverPage` off the same URL
 * query, one page of results plus facet counts, filtering on the server. None
 * of that is reimplemented here and none of it should be: if the two versions
 * ever disagree about what "open now" means or which places match "Thai", the
 * bug is that someone forked the predicate. The difference between this file
 * and `src/app/page.tsx` is entirely which components render the result.
 *
 * Three things are shaped differently for the phone:
 *
 * - **Every dimension behind one sheet.** The web rail shows neighbourhood,
 *   cuisine, price and category at once, in a 230px column a phone doesn't
 *   have. Here all four, plus the quick filters, live in PhoneFilterSheet, one
 *   tap away behind the Filters button, with the same counts on every row.
 *   Cuisine briefly also rode the row above the results as its own scrolling
 *   chip strip — a "browse" fast path, promoted out of the sheet — but that
 *   put the same dimension in two places at once on a screen with no room to
 *   spare. One way in now, like every other dimension.
 * - **"Show more" is a link, not a button.** Same `?shown=` round trip the web
 *   version spends through a transition. A phone list wants an obvious end to
 *   the page more than it wants seamlessness, and a link works before hydration.
 * - **No map.** The web discover page has none either, but it is worth stating:
 *   MapLibre on a phone is the single largest battery and jank cost in this
 *   product, and it should be a screen you choose to open, not one that boots
 *   under every list.
 *
 * This file is the only place in the tree that knows a filter parameter's name.
 * `hrefWith` builds every link the rail and the sheet render, so the URL a
 * phone produces is byte-identical to the one the desktop rail produces, and
 * `?nav=` survives all of them.
 */
export default async function PhoneDiscover({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  /* `nav` is the variant switcher, not a filter. It has to survive every link on
     the page but must never reach the filter parser, so it is stripped here and
     re-added by `hrefWith` below. Both halves disappear when the nav variants
     are cut down to one. */
  const nav = first(params.nav);

  // A display choice, not a filter — it never changes which restaurants
  // match, so it's carried across every link exactly like `nav` rather than
  // living in `search` or resetting `shown`. See PhoneLayoutToggle.
  const DEFAULT_COLS = "3";
  const rawCols = first(params.cols);
  const cols: "1" | "3" | "5" =
    rawCols === "1" || rawCols === "5" ? rawCols : DEFAULT_COLS;

  const search = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => {
      if (key === "nav" || key === "cols") return [];
      const single = first(value);
      return single === undefined ? [] : [[key, single] as [string, string]];
    }),
  );

  const page = await getDiscoverPage(search.toString(), { shown: parseShown(params.shown) });
  const { filters, counts, options } = page;

  /** A URL with one param changed, everything else — including `nav` and `cols` — held. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    if (nav) next.set("nav", nav);
    // Only carry the current cols forward when this call isn't the one
    // changing it — the loop above already applied an explicit change.
    if (!("cols" in changes) && cols !== DEFAULT_COLS) next.set("cols", cols);
    const query = next.toString();
    return query ? `/m?${query}` : "/m";
  };

  const layoutOptions: PhoneLayoutOption[] = [
    { cols: "1", label: "1 per row", selected: cols === "1", href: hrefWith({ cols: "1" }) },
    { cols: "3", label: "3 per row", selected: cols === "3", href: hrefWith({ cols: null }) },
    { cols: "5", label: "5 per row", selected: cols === "5", href: hrefWith({ cols: "5" }) },
  ];

  /**
   * One dimension of the sheet: the row that clears it, then every option with
   * the count `getDiscoverPage` computed for it.
   *
   * Counts are copied, never recomputed. They come from `countFacets`, which
   * runs the same predicate as the grid — the moment this file starts deriving
   * a number of its own, the sheet is describing a different query from the one
   * the results answered.
   */
  const group = (
    key: PhoneFilterGroup["key"],
    label: string,
    anyLabel: string,
    facet: readonly FacetOption[],
    facetCounts: Map<string, number>,
    anyCount: number,
    selected: string | null,
    searchNoun?: string,
  ): PhoneFilterGroup => {
    // Neighbourhood and Nearby are one dimension — "where" — so picking either
    // has to drop the other. `filtersFromSearch` already enforces it on the way
    // in; clearing the parameter here keeps the URL from carrying an intent it
    // is no longer honouring.
    const changes = (value: string | null) =>
      key === "neighborhood"
        ? { neighborhood: value, nearby: null, shown: null }
        : { [key]: value, shown: null };

    return {
      key,
      label,
      anyLabel,
      searchNoun,
      any: { count: anyCount, selected: selected === null, href: hrefWith(changes(null)) },
      options: facet.map((option) => ({
        value: option.value,
        count: facetCounts.get(option.value) ?? 0,
        selected: option.value === selected,
        // Tapping the option already on clears it — the same toggle the web
        // rail's rows do, so a chip and a row behave the same way.
        href: hrefWith(changes(option.value === selected ? null : option.value)),
      })),
    };
  };

  const quickHref = (next: readonly string[]) =>
    hrefWith({ quick: next.length > 0 ? next.join(",") : null, shown: null });

  /** Everything active except cuisine, which the rail already shows lit. */
  const chips: PhoneFilterChip[] = [];
  if (filters.neighborhood) {
    chips.push({
      key: "neighborhood",
      label: filters.neighborhood,
      removeHref: hrefWith({ neighborhood: null, shown: null }),
    });
  }
  // Only ever arrives on a link from the web version — there is no Nearby row
  // in the sheet, because this screen is rendered from the URL and coordinates
  // never go in one (see lib/discover.ts). It still counts as an active filter,
  // so it gets a chip: a visitor who lands here with it set needs a way out.
  if (filters.nearby) {
    chips.push({
      key: "nearby",
      label: "Nearby",
      removeHref: hrefWith({ nearby: null, shown: null }),
    });
  }
  if (filters.price) {
    chips.push({
      key: "price",
      label: filters.price,
      mono: true,
      removeHref: hrefWith({ price: null, shown: null }),
    });
  }
  if (filters.aspect) {
    chips.push({
      key: "aspect",
      label: filters.aspect,
      removeHref: hrefWith({ aspect: null, shown: null }),
    });
  }
  for (const quick of QUICK_FILTERS) {
    if (!filters.quick.includes(quick.value)) continue;
    chips.push({
      key: `quick-${quick.value}`,
      label: quick.label,
      removeHref: quickHref(filters.quick.filter((v) => v !== quick.value)),
    });
  }
  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      removeHref: hrefWith({ q: null, shown: null }),
    });
  }

  const clearHref = hrefWith({
    neighborhood: null,
    nearby: null,
    cuisine: null,
    price: null,
    aspect: null,
    quick: null,
    q: null,
    shown: null,
  });

  const model: PhoneFilterModel = {
    active: activeFilterCount(filters),
    total: page.total,
    clearHref,
    neighborhood: group(
      "neighborhood",
      "Neighborhood",
      "Anywhere",
      options.neighborhoods,
      counts.neighborhood,
      counts.anyNeighborhood,
      filters.neighborhood,
      "neighborhoods",
    ),
    cuisine: group(
      "cuisine",
      "Cuisine",
      "Any cuisine",
      options.cuisines,
      counts.cuisine,
      counts.anyCuisine,
      filters.cuisine,
      "cuisines",
    ),
    // No search noun: four bands in a fixed cheap-to-dear order are not
    // something anyone would type at.
    price: group(
      "price",
      "Price",
      "Any price",
      options.prices,
      counts.price,
      counts.anyPrice,
      filters.price,
    ),
    aspect: group(
      "aspect",
      "Rated well for",
      "Any category",
      options.aspects,
      counts.aspect,
      counts.anyAspect,
      filters.aspect,
      "categories",
    ),
    quick: QUICK_FILTERS.map((f) => {
      const on = filters.quick.includes(f.value);
      return {
        value: f.value,
        label: f.label,
        count: counts.quick[f.value],
        on,
        href: quickHref(
          on ? filters.quick.filter((v) => v !== f.value) : [...filters.quick, f.value],
        ),
      };
    }),
    chips,
  };

  /* The heading says what the page is about, which is the narrowing the visitor
     asked for: the cuisine (or the free-text term the header search left
     unpromoted) placed in the neighbourhood, if there is one. The rest of the
     filters are on chips in the rail rather than crammed in here — a headline
     reading "Mexican in North Park under $$ rated well for Food" is a URL, not
     a sentence. */
  const subject = filters.cuisine ?? filters.q ?? null;
  const heading = subject
    ? `${subject} in ${filters.neighborhood ?? "San Diego"}`
    : filters.neighborhood
      ? `Places in ${filters.neighborhood}`
      : "Find something good";

  return (
    <div className="min-h-dvh">
      {/*
        The header scrolls away rather than sticking. A 390px screen has roughly
        640 usable points of height and the nav already owns the bottom ~80 of
        them; spending another 100 permanently on a brand mark leaves less than
        two cards visible at rest. The nav is the thing that needs to be always
        reachable, and it is.
      */}
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          {/* BrandMark ships at its artwork size (165×210) and relies on the
              caller to size it — see its header comment. Sized and set
              (text-[19px] on the wrapper, which is what WordMark's bare span
              inherits) to echo the desktop header's own brand lockup — see
              Header.tsx's `text-[22px]` Link — rather than the smaller
              default this screen used to carry. */}
          <span className="flex items-center gap-2.5 text-[19px]">
            <BrandMark className="h-9 w-9" />
            <WordMark tone="dark" />
          </span>
          {/* Rightmost element is the one circular icon, flush to the edge —
              the same bilateral shape the desktop header closes on with its
              avatar circle (Header.tsx), rather than a text link trailing
              past the icon. */}
          <span className="flex shrink-0 items-center gap-1">
            <Link
              href="/"
              /* An escape hatch while both versions are live and being compared.
                 Not a permanent feature — when UA routing lands this becomes a
                 "view desktop site" affordance or disappears entirely. */
              className="min-h-11 shrink-0 self-center rounded-full px-2 font-mono text-[11px] text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Web version
            </Link>
            <PhoneLayoutToggle options={layoutOptions} />
          </span>
        </div>

        <h1 className="font-display mt-4 text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
          {heading}
        </h1>
        {/* Machine value, so mono — the count is generated, not written. */}
        <p className="mt-1 font-mono text-xs tabular-nums text-pm-grey-text">
          {page.total.toLocaleString()} {page.total === 1 ? "place" : "places"}
        </p>
      </header>

      <div className="px-4 pb-4">
        <PhoneFilterBar model={model} />
      </div>

      {page.results.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="font-display text-lg text-zinc-900">Nothing matches that</p>
          {/* Points at the sheet rather than guessing which filter did it: every
              row in there prints what it would return, and the ones reading 0
              are the ones ruling everything out. */}
          <p className="mx-auto mt-1 max-w-[15rem] text-sm leading-snug text-pm-grey-text">
            Every row under Filters shows how many places it would return.
          </p>
          <Link
            href={clearHref}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Clear filters
          </Link>
        </div>
      ) : cols === "3" ? (
        <div className="grid grid-cols-3 gap-2 px-4">
          {page.results.map((restaurant, index) => (
            <PhoneRestaurantCardGrid
              key={restaurant.id}
              restaurant={restaurant}
              score={restaurant.plateScore}
              priority={index < 3}
            />
          ))}
        </div>
      ) : cols === "5" ? (
        <div className="grid grid-cols-5 gap-1.5 px-4">
          {page.results.map((restaurant, index) => (
            <PhoneRestaurantCardTiny
              key={restaurant.id}
              restaurant={restaurant}
              score={restaurant.plateScore}
              priority={index < 5}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {page.results.map((restaurant, index) => (
            <PhoneRestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              score={restaurant.plateScore}
              priority={index < 2}
            />
          ))}
        </div>
      )}

      {page.total > page.shown && (
        <div className="px-4 pt-4">
          <Link
            href={hrefWith({ shown: String(page.shown + PAGE_SIZE) })}
            /* Full width and 48px tall: at the bottom of a long scroll this is
               a thumb target, not a text link. */
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-white text-sm font-medium text-zinc-900 transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Show more
            <span className="ml-1.5 font-mono text-xs tabular-nums text-zinc-500">
              {page.shown} / {page.total}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
