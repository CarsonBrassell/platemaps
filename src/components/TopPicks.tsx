type PickDish = {
  id: string;
  name: string;
  description?: string;
  price: string;
  pct: number | null;
  total: number;
};

export function TopPicks({
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
      {/* The section label sits on the cream ground — the white cards below
          are the grouping, not a container around them. */}
      <h2 className="mono-label px-1 text-zinc-500">The Hits</h2>

      {/* One row per dish, not the two-column grid this was.
          
          The grid gave each name half the column and dish names are long —
          "Meatball Ricotta Marinara Pizza" wrapped to three lines while the
          card beside it wrapped to one, so every row of the grid was as tall
          as its worst name and the descriptions sat at different heights. Full
          width buys the name one line and puts every percentage on the same
          right edge, so the section reads straight down as a ranked column,
          which is what a list of hits is. Matches PhoneDetailHits, which
          reached the same layout from the opposite direction — it never had
          the width to try a grid. */}
      <div className="mt-3 flex flex-col gap-2.5">
        {dishes.map((dish) => (
          <button
            key={dish.id}
            onClick={() => onSelect(dish.id)}
            className="card-lift group flex w-full items-start justify-between gap-4 rounded-2xl bg-white px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-snug text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {dish.name}
              </span>
              {/* What's on the plate, in the menu's own words — the row carries
                  this now that there is no photo to say it. */}
              {dish.description && (
                <span className="mt-0.5 block text-xs leading-snug text-zinc-500">
                  {dish.description}
                </span>
              )}
            </span>

            {/* The verdict anchored to the right edge of every row, the price
                tucked under it in the muted machine voice. The percentage is
                one of the accent's jobs, bold at this size so the lighter
                accent still clears the large-text contrast bar. */}
            <span className="shrink-0 text-right">
              <span className="block font-mono text-xl font-bold leading-none tabular-nums text-pm-orange">
                {dish.pct}%
              </span>
              <span className="mt-1 block font-mono text-xs tabular-nums text-zinc-500">
                {dish.price}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Machine footer: the denominator, and the way onward. */}
      <div className="mono-label mt-3.5 flex flex-wrap items-center justify-between gap-2 px-1 text-zinc-500">
        <span>
          Rated by {ratedBy.toLocaleString()} locals
        </span>
        <a
          href="#full-menu"
          className="rounded-full text-zinc-700 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange"
        >
          See full menu →
        </a>
      </div>
    </section>
  );
}
