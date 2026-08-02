type PickDish = {
  id: string;
  name: string;
  price: string;
  pct: number | null;
  total: number;
};

export function TopPicks({
  dishes,
  onSelect,
}: {
  dishes: PickDish[];
  onSelect: (dishId: string) => void;
}) {
  if (dishes.length === 0) return null;

  return (
    <div className="border-b-8 border-zinc-100 px-5 py-5">
      <p className="mb-4 flex items-center gap-1.5 text-base font-bold text-pm-orange-text">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L4.98 9.384c-.784-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
        Top picks
      </p>
      <div className="flex flex-col divide-y divide-zinc-100">
        {dishes.map((dish, i) => (
          <button
            key={dish.id}
            onClick={() => onSelect(dish.id)}
            className="group flex items-center gap-3 py-3.5 text-left transition-colors active:bg-pm-orange-tint/40"
          >
            <span
              className={
                i === 0
                  ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pm-orange text-[11px] font-bold text-white"
                  : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint text-[11px] font-bold text-pm-grey-text"
              }
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {dish.name}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {dish.price} &middot; {dish.total.toLocaleString()} ratings
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pm-orange to-pm-orange-text/90 transition-all duration-500"
                  style={{ width: `${dish.pct ?? 0}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 text-2xl font-extrabold tabular-nums text-pm-orange-text">
              {dish.pct}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
