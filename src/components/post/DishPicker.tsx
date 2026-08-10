"use client";

import { useEffect, useMemo, useState } from "react";
import { dishStats, type Dish } from "@/data/dishes";

/** What the meter step needs — a menu row, or a dish someone typed themselves. */
export type PickedDish = { id: string; name: string; price?: string };

/** One shared empty array, so the memo below isn't invalidated every render. */
const NO_DISHES: Dish[] = [];

/**
 * The restaurant's real menu, extracted from its own menu page.
 *
 * Rows carry the verdict the dish already holds so a picker doubles as a look at
 * what everyone else said — and the count is shown alongside the percentage,
 * because "100%" off two votes is a different fact from "84%" off ninety.
 *
 * Menus are extracted per restaurant and not every one has been done, so the
 * gap is stated and typing the dish stays possible rather than blocking the post.
 */
export function DishPicker({
  restaurantId,
  restaurantName,
  selectedId,
  onSelect,
}: {
  restaurantId: string;
  restaurantName: string;
  selectedId: string | null;
  onSelect: (dish: PickedDish) => void;
}) {
  /**
   * The menu, tagged with the restaurant it belongs to.
   *
   * Tagged rather than held as a bare array so "loading" can be *derived* —
   * a menu whose tag doesn't match the current `restaurantId` is by definition
   * not this restaurant's menu yet. The alternative, a separate `loading` flag
   * set at the top of the effect, is a synchronous setState in an effect body.
   *
   * Waiting has to be distinguishable from "this place has no menu", because
   * the empty case offers to type the dish instead — and showing that during
   * the fetch tells someone their restaurant has no menu a moment before its
   * menu appears underneath them.
   */
  const [menu, setMenu] = useState<{ restaurantId: string; dishes: Dish[] } | null>(null);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState(false);

  const loading = menu?.restaurantId !== restaurantId;
  const dishes = loading ? NO_DISHES : menu.dishes;

  // Fetched per restaurant, on selection. The composer knows which place it is
  // asking about by the time this mounts, so this is one menu over the wire
  // rather than the whole dish table — the shape this scales in.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/restaurants/dishes?ids=${encodeURIComponent(restaurantId)}`,
        );
        if (!res.ok) throw new Error("menu unavailable");
        const data: { dishes: Record<string, Dish[]> } = await res.json();
        if (cancelled) return;
        const dishes = data.dishes[restaurantId] ?? [];
        setMenu({ restaurantId, dishes });
        setTyping(dishes.length === 0);
      } catch {
        // A menu that won't load is the same situation as a menu that doesn't
        // exist, from the composer's point of view: type the dish and carry on.
        if (cancelled) return;
        setMenu({ restaurantId, dishes: [] });
        setTyping(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q ? dishes.filter((d) => d.name.toLowerCase().includes(q)) : dishes;
    const grouped = new Map<string, Dish[]>();
    for (const dish of matching) {
      const list = grouped.get(dish.section);
      if (list) list.push(dish);
      else grouped.set(dish.section, [dish]);
    }
    return [...grouped.entries()];
  }, [dishes, query]);

  const customName = custom.trim();

  /* Held rather than guessed at. Falling through to the normal render would
     show "we haven't got their menu yet" for as long as the request takes,
     which is a claim about the restaurant, not about the network. */
  if (loading) {
    return (
      <div className="rounded-xl bg-pm-grey-tint/50 px-4 py-8 text-center">
        <p className="text-sm text-zinc-500">Loading {restaurantName}&rsquo;s menu…</p>
      </div>
    );
  }

  return (
    <div>
      {dishes.length > 0 && (
        <>
          <label htmlFor="dish-search" className="sr-only">
            Search the menu
          </label>
          <input
            id="dish-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${restaurantName}'s menu`}
            autoComplete="off"
            className="min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
          />

          {sections.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              Nothing on the menu matches “{query.trim()}”.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {sections.map(([section, list]) => (
                <div key={section}>
                  <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {section}
                    <span className="h-px flex-1 bg-zinc-100" aria-hidden="true" />
                  </p>
                  <ul className="flex flex-col divide-y divide-zinc-100">
                    {list.map((dish) => {
                      const { total, pct } = dishStats(dish.yesVotes, dish.noVotes);
                      const on = dish.id === selectedId;
                      return (
                        <li key={dish.id}>
                          <button
                            type="button"
                            onClick={() => onSelect({ id: dish.id, name: dish.name, price: dish.price })}
                            aria-pressed={on}
                            className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange ${
                              on ? "bg-pm-orange-tint/60" : "hover:bg-pm-grey-tint/60"
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-medium ${
                                  on ? "text-pm-orange-text" : "text-zinc-800"
                                }`}
                              >
                                {dish.name}
                              </span>
                              {pct !== null && (
                                <span className="mt-0.5 block text-xs text-zinc-500">
                                  {pct}% would eat it · {total}{" "}
                                  {total === 1 ? "verdict" : "verdicts"}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-sm font-medium text-zinc-500">
                              {dish.price}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {typing ? (
          <div>
            <label htmlFor="custom-dish" className="mb-1.5 block text-sm font-medium text-zinc-700">
              {dishes.length === 0
                ? `We haven't got ${restaurantName}'s menu yet — what did you order?`
                : "What did you order?"}
            </label>
            <div className="flex gap-2">
              <input
                id="custom-dish"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Hot honey pepperoni pizza"
                maxLength={120}
                className="min-h-11 flex-1 rounded-xl bg-pm-grey-tint/60 px-3.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
              />
              <button
                type="button"
                disabled={!customName}
                onClick={() => onSelect({ id: `custom:${customName.toLowerCase()}`, name: customName })}
                className="min-h-11 shrink-0 rounded-full bg-pm-charcoal px-4 text-sm font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Use this
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="min-h-11 text-sm font-medium text-pm-orange-text transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Not on the menu? Type it instead
          </button>
        )}
      </div>
    </div>
  );
}
