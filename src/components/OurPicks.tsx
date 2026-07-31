import { restaurants } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";

export function OurPicks() {
  const picks = restaurants.filter((r) => r.trending).slice(0, 2);
  if (picks.length === 0) return null;

  return (
    <div className="border-b border-zinc-100 bg-white px-5 py-3">
      <p className="mb-2 text-sm font-bold text-pm-orange-text">Our picks</p>
      <div className="grid grid-cols-2 gap-3">
        {picks.map((r) => (
          <div
            key={r.id}
            className="trending-glow flex cursor-pointer items-center gap-3 rounded-xl border-2 border-pm-orange bg-white p-2 transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-pm-orange-tint">
              <UtensilsIcon className="h-5 w-5 text-pm-orange-text" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">{r.name}</p>
              <div className="flex items-center gap-1">
                <StarIcon className="h-3 w-3 text-pm-orange" />
                <span className="text-xs font-medium text-zinc-700">{r.rating.toFixed(1)}</span>
                <span className="truncate text-xs text-zinc-400">
                  &middot; {r.cuisine}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
