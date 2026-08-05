import Link from "next/link";
import { restaurants } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";

export function OurPicks() {
  const picks = restaurants.filter((r) => r.trending).slice(0, 2);
  if (picks.length === 0) return null;

  return (
    <div className="border-b border-zinc-100 bg-white px-5 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-medium text-zinc-900">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-orange" aria-hidden="true">
          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L4.98 9.384c-.784-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
        </svg>
        Our picks
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {picks.map((r) => (
          <Link
            key={r.id}
            href={`/restaurant/${r.id}`}
            className="trending-glow group block overflow-hidden rounded-xl border-2 border-pm-orange bg-white transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98]"
          >
            <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/25">
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.7), transparent 40%), radial-gradient(circle at 80% 80%, rgba(181,80,43,0.18), transparent 45%)",
                }}
                aria-hidden="true"
              />
              <UtensilsIcon className="relative h-8 w-8 text-pm-orange-text transition-transform duration-300 group-hover:scale-110" />
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pm-orange-text shadow-sm backdrop-blur-sm">
                Trending
              </span>
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
          </Link>
        ))}
      </div>
    </div>
  );
}
