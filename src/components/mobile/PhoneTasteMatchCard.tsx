import Link from "next/link";
import { TasteRadar } from "@/components/TasteRadar";
import { restaurantHref } from "@/lib/restaurantHref";
import type { TasteMatch } from "@/lib/tasteMatch";

/**
 * The phone profile's Taste match — twin of `TasteMatchCard`, same data, same
 * radar. Differences are all layout: the summary tiles stack (two columns would
 * leave "Bakery & Desserts · Burgers" nowhere to go at 390px) and the
 * restaurant link takes the `min-h-11` target this tree requires.
 *
 * `to` is the profile page's `?nav=` carrier, so the tap keeps the nav variant.
 */
export function PhoneTasteMatchCard({
  friendName,
  match,
  to = (href) => href,
}: {
  friendName: string;
  match: TasteMatch | null;
  to?: (href: string) => string;
}) {
  return (
    <section aria-label="Taste match" className="mx-4 mt-6 rounded-2xl bg-white px-5 py-5">
      <p className="mono-label text-zinc-900">Taste match</p>

      {!match ? (
        <p className="mt-3 text-sm text-zinc-500">
          Post a few more plates to see your taste match.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-[44px] font-medium leading-none tabular-nums text-pm-orange">
              {match.matchPct}%
            </span>
            <span className="text-sm leading-snug text-zinc-600">
              of your plates overlap with {friendName}
            </span>
          </p>

          <div className="mt-3">
            <TasteRadar match={match} themLabel={friendName} />
          </div>

          <div className="mt-4 grid gap-2.5 text-left">
            <div className="rounded-xl bg-pm-grey-tint/50 p-3">
              <p className="mono-label text-zinc-500">You both love</p>
              <p className="mt-1 text-sm font-medium text-zinc-800">
                {match.bothLove.length > 0 ? match.bothLove.join(" · ") : "Nothing yet"}
              </p>
            </div>
            <div className="rounded-xl bg-pm-grey-tint/50 p-3">
              <p className="mono-label text-zinc-500">Try their pick</p>
              {match.tryPick ? (
                <>
                  <p className="mt-1 text-sm font-medium text-zinc-800">{match.tryPick.cuisine}</p>
                  <Link
                    href={to(restaurantHref("/m/restaurant", { id: match.tryPick.restaurantId }))}
                    className="-mb-3 flex min-h-11 items-center text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    {match.tryPick.restaurantName}
                  </Link>
                </>
              ) : (
                <p className="mt-1 text-sm font-medium text-zinc-800">Nothing new</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
