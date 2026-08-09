import Link from "next/link";
import { restaurants } from "@/data/restaurants";
import { StarIcon, UtensilsIcon } from "@/components/icons";
import { RestaurantPhoto } from "@/components/RestaurantPhoto";

export function OurPicks() {
  const picks = restaurants.filter((r) => r.trending).slice(0, 2);
  if (picks.length === 0) return null;

  return (
    <section aria-labelledby="our-picks" className="mb-7">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2
          id="our-picks"
          className="font-display flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-orange" aria-hidden="true">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L4.98 9.384c-.784-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
          </svg>
          Our picks
        </h2>
        <span className="text-xs text-zinc-500">Featured this week</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {picks.map((r) => (
          <Link
            key={r.id}
            href={`/restaurant/${r.id}`}
            className="trending-glow group block overflow-hidden rounded-xl border-2 border-pm-orange bg-white transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {/* A full 16:9 is worth it for a real photo and is just a large
                empty box without one, so the band collapses until there is
                something to show. */}
            <div
              className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/25 ${
                r.photo ? "aspect-[16/9]" : "h-20"
              }`}
            >
              <RestaurantPhoto
                photo={r.photo}
                photoAlt={r.photoAlt}
                sizes="(max-width: 640px) 100vw, 300px"
                /* Above the fold on the homepage, and only ever two of them. */
                priority
                className="transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                fallback={
                  <>
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.7), transparent 40%), radial-gradient(circle at 80% 80%, rgba(181,80,43,0.18), transparent 45%)",
                      }}
                      aria-hidden="true"
                    />
                    <UtensilsIcon className="relative h-8 w-8 text-pm-orange-text transition-transform duration-300 group-hover:scale-110" />
                  </>
                }
              />
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pm-orange-text shadow-sm backdrop-blur-sm">
                Promoted
              </span>
              {/* Same credit the grid cards carry — see the note in
                  RestaurantCard for why it isn't the link back. */}
              {r.photo && (
                <span className="absolute bottom-2 right-2 whitespace-nowrap rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  Photo: Yelp
                </span>
              )}
            </div>
            <div className="p-3.5">
              <p className="font-display text-[15px] font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-pm-orange-text">
                {r.name}
              </p>
              <div className="mb-1 mt-1 flex items-center gap-1">
                <StarIcon className="h-3.5 w-3.5 text-pm-orange" />
                <span className="text-xs font-medium tabular-nums text-zinc-700">
                  {r.rating.toFixed(1)}
                </span>
                <span className="text-xs tabular-nums text-zinc-500">
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
    </section>
  );
}
