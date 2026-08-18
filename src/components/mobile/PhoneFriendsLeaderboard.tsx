import { PointsBadge } from "@/components/feed/PointsBadge";
import { formatPoints } from "@/lib/points";
import { initials } from "@/lib/format";

type Entry = { id: string; name: string; avatarUrl?: string; points: number };

/**
 * PM Points, ranked against your friends and only your friends — never the
 * whole site. The site-wide leaderboard (`getLeaderboard` in lib/db.ts,
 * `/api/leaderboard`) still exists but has no importer anywhere in the
 * product (see PhoneFeedScreen's header comment); this is a different,
 * narrower thing, not that one rebuilt. Ranking is computed here, client-side,
 * off the same `friends` list and `account` the rest of the screen already
 * fetched — no new endpoint, and nothing to fall out of sync with `points.ts`
 * since `points` on both is the same live column every post/like/comment
 * award writes to.
 *
 * The `№` rank prefix is the same "machine-issued record number" idiom
 * PhoneDetailHero uses for "Spot №001" — reused rather than invented, and the
 * closest thing this design system has to a menu/ledger motif. Still no
 * medals or a separate crown for #1, per PRODUCT.md's own note that points
 * are "a capability, not the reason the product wins" — the one deliberate
 * escalation is the points badge itself (`tone="orange"`), because a
 * leaderboard's whole subject is the number, unlike a post card's badge.
 *
 * The gap line under each row (except #1) is computed from the same sorted
 * array, not a second query — "how far to the rank above" is just the
 * previous row's points minus this one's.
 */
export function PhoneFriendsLeaderboard({ friends, you }: { friends: Entry[]; you: Entry }) {
  if (friends.length === 0) return null;

  const ranked = [...friends, you].sort((a, b) => b.points - a.points);

  return (
    <section aria-labelledby="phone-leaderboard-heading" className="mb-7 px-4">
      <p id="phone-leaderboard-heading" className="mono-label mb-2 text-pm-grey-text">
        Leaderboard
      </p>
      <ol className="overflow-hidden rounded-2xl bg-white">
        {ranked.map((entry, index) => {
          const rank = index + 1;
          const isYou = entry.id === you.id;
          const gap = index > 0 ? ranked[index - 1].points - entry.points : 0;
          return (
            <li
              key={entry.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 ${
                isYou ? "bg-pm-orange-tint" : "bg-white"
              } ${index > 0 ? "border-t border-[var(--pm-grey-tint)]" : ""}`}
            >
              <span
                className={`mono-label w-8 shrink-0 ${
                  rank === 1 ? "text-pm-orange-text" : "text-pm-grey-text"
                }`}
              >
                №{rank}
              </span>
              {entry.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.avatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text">
                  {initials(entry.name)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate text-[15px] font-semibold leading-tight text-zinc-900">
                  {isYou ? "You" : entry.name}
                </span>
                {/* Rank 1 has nothing above it to close the gap on; a tie
                    prints nothing rather than "0 to catch" reading like a bug. */}
                {rank === 1 ? (
                  <span className="font-mono text-[11px] text-pm-grey-text">In the lead</span>
                ) : gap > 0 ? (
                  <span className="font-mono text-[11px] tabular-nums text-pm-grey-text">
                    {formatPoints(gap)} to catch №{rank - 1}
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-pm-grey-text">Tied for №{rank - 1}</span>
                )}
              </span>
              <PointsBadge points={entry.points} size="md" tone="orange" />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
