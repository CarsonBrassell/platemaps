"use client";

import { BrandMark, WordMark } from "@/components/BrandMark";
import { PhoneDiscoverSearch } from "@/components/mobile/PhoneDiscoverSearch";
import { PhoneFilterBar } from "@/components/mobile/PhoneFilterBar";
import type {
  PhoneFilterChip,
  PhoneFilterGroup,
  PhoneFilterModel,
} from "@/components/mobile/PhoneFilterSheet";
import { PhoneStickyBar } from "@/components/mobile/PhoneStickyBar";
import { PhoneDiscoverResults } from "@/components/mobile/PhoneDiscoverResults";
import type { DiscoverPage } from "@/lib/discover";
import {
  PAGE_SIZE,
  QUICK_FILTERS,
  activeFilterCount,
  type FacetOption,
} from "@/lib/discoverFilters";
import { useDiscoverQuery } from "@/lib/useDiscoverQuery";

/**
 * The phone Discover screen. This used to be the body of src/app/m/page.tsx,
 * rendered on the server for every URL; the page is a static shell now and
 * the URL is answered here (lib/useDiscoverQuery.ts). Every control is still
 * a link — the filter sheet, the chips, Show more — because a link is a
 * thumb target with history and a shareable address, and the hook picks the
 * navigation up through DiscoverQuerySync rather than re-rendering the route.
 */
export function PhoneDiscoverScreen({ initial }: { initial: DiscoverPage }) {
  const { view, pending, viewKey, search, raw } = useDiscoverQuery(initial, "/m");
  const { filters, counts, options } = view;

  /* `?nav=` selects a nav variant on the phone; it rides along on every link
     the page builds but must never reach the filter parser, so the hook
     strips it and it is re-added by `hrefWith` below. `?cols=` is the retired
     column switch: dropped on the way in so old links land on the grid. */
  const nav = new URLSearchParams(raw).get("nav");

  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    if (nav) next.set("nav", nav);
    const query = next.toString();
    return query ? `/m?${query}` : "/m";
  };

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
        href: hrefWith(changes(option.value === selected ? null : option.value)),
      })),
    };
  };

  const quickHref = (next: readonly string[]) =>
    hrefWith({ quick: next.length > 0 ? next.join(",") : null, shown: null });

  const chips: PhoneFilterChip[] = [];
  if (filters.neighborhood) {
    chips.push({
      key: "neighborhood",
      label: filters.neighborhood,
      removeHref: hrefWith({ neighborhood: null, shown: null }),
    });
  }
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
  if (filters.dish) {
    chips.push({
      key: "dish",
      label: `Serving ${filters.dish}`,
      removeHref: hrefWith({ dish: null, shown: null }),
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
    dish: null,
    shown: null,
  });

  const model: PhoneFilterModel = {
    active: activeFilterCount(filters),
    total: view.total,
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

  /* The heading names what was asked for: the dish, cuisine or free-text
     term placed in the neighbourhood, if there is one. The rest of the
     filters are chips in the rail rather than crammed in here — "Mexican in
     North Park under $$ rated well for Food" is a URL, not a sentence. The
     dish comes first because it came off a list rather than a text field, so
     it is the one word guaranteed to be real. */
  const subject = filters.dish ?? filters.cuisine ?? filters.q ?? null;
  const heading = subject
    ? `${subject} in ${filters.neighborhood ?? "San Diego"}`
    : filters.neighborhood
      ? `Places in ${filters.neighborhood}`
      : "Find something good";

  return (
    <div className="min-h-dvh">
      {/* The header scrolls away rather than sticking: a 390px screen has
          roughly 640 usable points and the nav already owns the bottom ~80;
          spending another 100 permanently on a brand mark leaves less than
          two cards visible at rest. BrandMark ships at its artwork size and
          is sized by height alone (`w-auto`) so the gap is the gap — see its
          header comment and Header.tsx for the desktop lockup it echoes. */}
      <header className="px-4 pb-3 pt-4">
        <span className="flex items-center gap-2.5 text-[22px]">
          <BrandMark className="h-11 w-auto" />
          <WordMark tone="dark" />
        </span>

        <h1 className="font-display mt-5 text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
          {heading}
        </h1>
        {/* Machine value, so mono — the count is generated, not written. */}
        <p className="mt-1 font-mono text-xs tabular-nums text-pm-grey-text">
          {view.total.toLocaleString()} {view.total === 1 ? "place" : "places"}
        </p>
      </header>

      {/* Search above the filters, because a name is the question most people
          arrive with. The pair rides up out of the way once you are down in
          the grid and comes back on the first upward scroll (PhoneStickyBar);
          the brand and heading are not in the bar because they are read once.
          PhoneFilterBar's sheet is `position: fixed` — that constraint is why
          the bar moves a sticky offset rather than a transform. */}
      <PhoneStickyBar className="pt-1">
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          <PhoneDiscoverSearch value={filters.q ?? ""} />
          <PhoneFilterBar model={model} />
        </div>
      </PhoneStickyBar>

      <PhoneDiscoverResults
        view={view}
        pending={pending}
        viewKey={viewKey}
        clearHref={clearHref}
        moreHref={hrefWith({ shown: String(view.shown + PAGE_SIZE) })}
      />
    </div>
  );
}
