import { restaurants } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";

export function OurPicks() {
  const picks = restaurants.filter((r) => r.trending).slice(0, 2);
  if (picks.length === 0) return null;

  return (
    <div className="border-b border-zinc-100 bg-white px-5 py-4">
      <p className="mb-3 text-sm font-bold text-pm-orange-text">Our picks</p>
      <div className="grid grid-cols-2 gap-3">
        {picks.map((r) => (
          <div
            key={r.id}
            className="trending-glow cursor-pointer overflow-hidden rounded-xl border-2 border-pm-orange bg-white transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <div className="flex aspect-[16/9] items-center justify-center bg-pm-orange-tint">
              <UtensilsIcon className="h-7 w-7 text-pm-orange-text" />
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-zinc-900">{r.name}</p>
              <div className="mb-1 mt-0.5 flex items-center gap-1">
                <StarIcon className="h-3.5 w-3.5 text-pm-orange" />
                <span className="text-xs font-medium text-zinc-700">{r.rating.toFixed(1)}</span>
                <span className="text-xs text-zinc-400">
                  ({r.reviewCount.toLocaleString()})
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {r.cuisine} &middot; {r.neighborhood}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
