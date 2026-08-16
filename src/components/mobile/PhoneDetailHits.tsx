type PickDish = {
  id: string;
  name: string;
  description?: string;
  price: string;
  pct: number | null;
  total: number;
};

/**
 * `THE HITS`, one dish per row.
 *
 * The web version is a two-column grid because it has 400–1000px to spend and
 * the cards are the page's centrepiece. At 390px that same grid gives each dish
 * ~170px, which is narrower than most dish names — "Beer-battered fish and
 * chips" wraps to three lines and the description has to be dropped to keep the
 * pair of cards the same height. One column per dish buys the full width back:
 * the name gets one line, the description survives, and the row is a 44px+
 * target for a thumb instead of a half-width tile.
 *
 * Each dish is its own white card rather than a row inside one shared card,
 * which is the same reason the discover list stacks cards: with no borders and
 * no shadows available (DESIGN.md), the cream gap between cards is the only
 * separator this system has. `FullMenu` gets away with plain rows because its
 * rows are one line each and grouped under section labels; a hit is three lines
 * and a number.
 *
 * The numbers keep their jobs: the price is a machine value in muted mono, the
 * recommendation percentage is the accent, and neither is ever the other's
 * colour.
 */
export function PhoneDetailHits({
  dishes,
  ratedBy,
  onSelect,
}: {
  dishes: PickDish[];
  /** Total dish ratings across this restaurant's whole menu. */
  ratedBy: number;
  onSelect: (dishId: string) => void;
}) {
  if (dishes.length === 0) return null;

  return (
    <section aria-label="Top dishes">
      {/* The label sits on the cream — the cards below are the grouping, so it
          takes the cream-safe muted token rather than zinc-500 (AGENTS.md). */}
      <h2 className="mono-label px-1 text-pm-grey-text">The Hits</h2>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {dishes.map((dish) => (
          <button
            key={dish.id}
            onClick={() => onSelect(dish.id)}
            className="flex w-full min-h-11 items-start justify-between gap-4 rounded-2xl bg-white px-4 py-3.5 text-left transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-zinc-900">
                {dish.name}
              </span>
              {/* What is on the plate, in the menu's own words. There is no dish
                  photography, so this line is the plate. */}
              {dish.description && (
                <span className="mt-0.5 block text-[13px] leading-snug text-zinc-500">
                  {dish.description}
                </span>
              )}
            </span>

            {/* The verdict anchored to the right edge of every row, so a
                screenful of hits reads straight down as a column of numbers —
                the price tucked under it in the muted machine voice. */}
            <span className="shrink-0 text-right">
              <span className="block font-mono text-xl font-bold leading-none tabular-nums text-pm-orange">
                {dish.pct}%
              </span>
              <span className="mt-1 block font-mono text-[11px] tabular-nums text-zinc-500">
                {dish.price}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Machine footer: the denominator, and the way onward. */}
      <div className="mono-label mt-1 flex flex-wrap items-center justify-between gap-x-3 px-1 text-pm-grey-text">
        <span>Rated by {ratedBy.toLocaleString()} locals</span>
        <a
          href="#full-menu"
          className="inline-flex min-h-11 items-center rounded-full text-pm-grey-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          See full menu →
        </a>
      </div>
    </section>
  );
}
