type PickDish = {
  id: string;
  name: string;
  price: string;
  pct: number | null;
  total: number;
};

/* Warm tone blocks stand where dish photos don't exist yet. Cycled by
   position so adjacent cards don't repeat the same tone. */
const TONES = ["var(--pm-tone-1)", "var(--pm-tone-2)", "var(--pm-tone-3)"];

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
        {dishes.map((dish, i) => (
          <button
            key={dish.id}
            onClick={() => onSelect(dish.id)}
            className="card-lift group flex flex-col overflow-hidden rounded-2xl bg-white text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <div
              className="m-2 aspect-[4/3] shrink-0 rounded-[10px]"
              style={{ background: TONES[i % TONES.length] }}
              aria-hidden="true"
            />
            <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-0.5">
              <p className="text-sm font-medium leading-snug text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {dish.name}
              </p>
              <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
                <span className="font-mono text-xs text-zinc-500">{dish.price}</span>
                {/* The recommendation percentage — one of the accent's jobs.
                    Bold at this size so the lighter accent still clears the
                    large-text contrast bar. */}
                <span className="font-mono text-xl font-bold tabular-nums text-pm-orange">
                  {dish.pct}%
                </span>
              </div>
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
