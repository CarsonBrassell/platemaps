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

      <div className="mt-3 grid grid-cols-2 gap-3">
        {dishes.map((dish) => (
          <button
            key={dish.id}
            onClick={() => onSelect(dish.id)}
            className="card-lift group flex flex-col rounded-2xl bg-white px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <p className="text-sm font-medium leading-snug text-zinc-900 transition-colors group-hover:text-pm-orange-text">
              {dish.name}
            </p>
            {/* What's on the plate, in the menu's own words — the card carries
                this now that there is no photo to say it. */}
            {dish.description && (
              <p className="mt-1 text-xs leading-snug text-zinc-500">{dish.description}</p>
            )}
            <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
              <span className="font-mono text-xs text-zinc-500">{dish.price}</span>
              {/* The recommendation percentage — one of the accent's jobs.
                  Bold at this size so the lighter accent still clears the
                  large-text contrast bar. */}
              <span className="font-mono text-xl font-bold tabular-nums text-pm-orange">
                {dish.pct}%
              </span>
            </div>
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
