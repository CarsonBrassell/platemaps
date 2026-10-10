import Link from "next/link";
import { TasteRadar } from "@/components/TasteRadar";
import { restaurantHref } from "@/lib/restaurantHref";
import type { TasteMatch } from "@/lib/tasteMatch";

/**
 * The web profile's Taste match — a friend's cuisine mix laid over yours, one
 * number for how much they overlap, and two lines of what to do about it.
 *
 * `match` is null for the empty state (either side has too few cuisine-tagged
 * plates), which keeps the card in place rather than vanishing: a friend's
 * profile that says "post a few more plates" is a prompt; one that's missing a
 * card is a mystery. Whether the card shows at all — friends only, never your
 * own profile — is `getTasteMatchForProfile`'s call, not this component's.
 *
 * The phone twin is `mobile/PhoneTasteMatchCard`. Both draw `TasteRadar` and
 * read the same `TasteMatch`; only the clothes differ.
 */
export function TasteMatchCard({
  friendName,
  match,
}: {
  friendName: string;
  match: TasteMatch | null;
}) {
  return (
    <section aria-label="Taste match" className="mx-4 mt-6 rounded-2xl bg-white px-6 py-6 sm:mx-6">
      <p className="mono-label text-zinc-900">Taste match</p>

      {!match ? (
        <p className="mt-3 text-sm text-zinc-500">
          Post a few more plates to see your taste match.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-5xl font-medium tabular-nums text-pm-orange">
              {match.matchPct}%
            </span>
            <span className="text-sm text-zinc-600">of your plates overlap with {friendName}</span>
          </p>

          <div className="mt-4">
            <TasteRadar match={match} themLabel={friendName} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-pm-grey-tint/50 p-3">
              <p className="mono-label text-zinc-500">You both love</p>
              <p className="mt-1 text-sm font-medium text-zinc-800">
                {match.bothLove.length > 0 ? match.bothLove.join(" · ") : "Nothing yet"}
              </p>
            </div>
            <div className="rounded-xl bg-pm-grey-tint/50 p-3">
              <p className="mono-label text-zinc-500">Try their pick</p>
              {match.tryPick ? (
                <p className="mt-1 text-sm font-medium text-zinc-800">
                  {match.tryPick.cuisine}
                  <span className="text-zinc-400"> · </span>
                  <Link
                    href={restaurantHref("/restaurant", { id: match.tryPick.restaurantId })}
                    className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
                  >
                    {match.tryPick.restaurantName}
                  </Link>
                </p>
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
