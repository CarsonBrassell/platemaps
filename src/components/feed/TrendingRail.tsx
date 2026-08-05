"use client";

import Link from "next/link";
import { StarIcon, UtensilsIcon } from "@/components/icons";
import { restaurants } from "@/data/restaurants";

/** Live-ish signals shown under the leaderboard. Seeded, not user-generated. */
const PULSE = [
  { id: "p1", text: "Fish taco plate just dropped to $12", place: "Karina's Tacos", time: "12m" },
  { id: "p2", text: "No wait right now", place: "Mariscos German", time: "28m" },
  { id: "p3", text: "5 check-ins in the last hour", place: "Communal Coffee", time: "1h" },
];

export function TrendingRail() {
  const trending = restaurants.filter((r) => r.trending).slice(0, 3);

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="trending-heading"
        className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
      >
        <h2
          id="trending-heading"
          className="font-display border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900"
        >
          Trending near you
        </h2>
        <ul className="divide-y divide-zinc-100">
          {trending.map((r) => (
            <li key={r.id}>
              <Link
                href={`/restaurant/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-pm-grey-tint/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pm-orange-tint to-pm-orange/25 text-pm-orange-text">
                  <UtensilsIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-800">
                    {r.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {r.cuisine} · {r.neighborhood}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-zinc-700">
                  <StarIcon className="h-3.5 w-3.5 text-pm-orange" />
                  {r.rating.toFixed(1)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="pulse-heading"
        className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm"
      >
        <h2
          id="pulse-heading"
          className="font-display border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900"
        >
          Happening now
        </h2>
        <ul className="divide-y divide-zinc-100">
          {PULSE.map((p) => (
            <li key={p.id} className="px-4 py-2.5">
              <p className="text-sm leading-snug text-zinc-700">{p.text}</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                {p.place} · {p.time} ago
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
