import { formatPoints } from "@/lib/points";
import { avatarPalette, initials } from "@/lib/format";
import { STATIONS } from "@/lib/stations";

type Entry = { id: string; name: string; avatarUrl?: string; points: number };

/**
 * Plate Points, ranked against your friends and only your friends — never the
 * whole site. The site-wide leaderboard (`getLeaderboard` in lib/db.ts,
 * `/api/leaderboard`) still exists but has no importer anywhere in the
 * product (see PhoneFeedScreen's header comment); this is a different,
 * narrower thing, not that one rebuilt. Ranking is computed here, client-side,
 * off the same `friends` list and `account` the rest of the screen already
 * fetched — no new endpoint, and nothing to fall out of sync with `points.ts`
 * since `points` on both is the same live column every post/like/comment
 * award writes to.
 *
 * **It is laid out as a printed menu**, which is the whole of its visual
 * design and the reason for every choice below:
 *
 * - **Courses, not one flat list.** The top three sit under `CHEF'S TABLE`,
 *   everyone else under `THE LINE`, each heading centred between dotted rules.
 *   Two `<ol>`s rather than one, with `start={4}` on the second so the split
 *   is presentational and the ordinal semantics survive it.
 * - **Points are set like prices**: name hard left, mono number hard right,
 *   dotted leader running between them — the same device `LeaderboardRow`
 *   uses on the web. It replaced a `PointsBadge tone="orange"` on every row;
 *   a column of orange pills spent the accent DESIGN.md rations to about
 *   three per screen, and a price on a menu is ink, not a highlight.
 * - **The `№` rank prefix** is the same "machine-issued record number" idiom
 *   PhoneDetailHero uses for "Spot №001", and `№1` is the one thing that
 *   still takes orange. Station titles (`STATIONS`) carry the podium instead
 *   of medals or a crown, per PRODUCT.md's note that points are "a
 *   capability, not the reason the product wins".
 * - **The dotted rules are typography, not grouping.** DESIGN.md's no-borders
 *   rule is about how cards group — this is one white card, and the leaders
 *   inside it are how a menu sets a price. All of them are `aria-hidden`.
 *
 * **No count of people appears anywhere**, and none may be added — not "5 at
 * the table", not a rank denominator like `№2 of 6`. Friend counts never
 * display in this product (see PhoneFriendsScreen's header comment and
 * `getFriends` in lib/db.ts); a leaderboard is the easiest place to leak one
 * back in, since its last rank *is* the count.
 *
 * The standing line under each name is computed from the same sorted array,
 * not a second query — "how far to the rank above" is just the previous row's
 * points minus this one's.
 */

/** Dotted leader/rule. Decorative everywhere it is used. */
const DOTS = "h-px flex-1 border-b border-dotted border-zinc-300";

type Seat = { entry: Entry; rank: number; gap: number; isYou: boolean };

/**
 * A course heading, centred between two rules. `.mono-label` is unlayered in
 * globals.css and outranks Tailwind's font utilities, so this sets colour
 * only — a weight alongside it would be silently discarded.
 */
function Course({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-1.5 pt-3.5">
      <span aria-hidden="true" className={DOTS} />
      <span className="mono-label text-zinc-500">{label}</span>
      <span aria-hidden="true" className={DOTS} />
    </div>
  );
}

/**
 * Rank 1 has nothing above it to close the gap on, and a tie prints its own
 * line rather than "0 to catch" reading like a bug. Top three prepend their
 * station, so the line reads as a menu item's tags do.
 */
function standingFor(rank: number, gap: number) {
  const standing =
    rank === 1
      ? "In the lead"
      : gap > 0
        ? `${formatPoints(gap)} to catch №${rank - 1}`
        : `Tied for №${rank - 1}`;
  return STATIONS[rank] ? `${STATIONS[rank]} · ${standing}` : standing;
}

function Seat({ entry, rank, gap, isYou }: Seat) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl px-1.5 py-2 ${
        isYou ? "bg-pm-orange-tint" : ""
      }`}
    >
      <span
        className={`w-7 shrink-0 font-mono text-[11px] font-medium tabular-nums ${
          rank === 1 ? "text-pm-orange-text" : "text-zinc-500"
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
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium text-white ${avatarPalette(entry.name).avatarBg}`}
        >
          {initials(entry.name)}
        </span>
      )}

      {/* A menu item, set the way a menu sets one: name, leader dots, price on
          one line; the description on its own line beneath, where it gets the
          full width. Both halves competing for one line was the first draft —
          the dots collapsed to nothing on exactly the rows with the longest
          standing line, and that line truncated mid-number. */}
      <span className="min-w-0 flex-1">
        <span className="flex items-end gap-1.5">
          <span className="font-display truncate text-[15px] font-semibold leading-tight text-zinc-900">
            {isYou ? "You" : entry.name}
          </span>
          <span aria-hidden="true" className={`${DOTS} mb-[5px] min-w-4`} />
          <span className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold leading-none tabular-nums text-zinc-900">
            {formatPoints(entry.points)}
            <span className="sr-only"> Plate Points</span>
          </span>
        </span>
        <span className="mt-1 block truncate font-mono text-[11px] leading-tight tabular-nums text-zinc-500">
          {standingFor(rank, gap)}
        </span>
      </span>
    </li>
  );
}

export function PhoneFriendsLeaderboard({ friends, you }: { friends: Entry[]; you: Entry }) {
  if (friends.length === 0) return null;

  const ranked = [...friends, you].sort((a, b) => b.points - a.points);
  const seats: Seat[] = ranked.map((entry, index) => ({
    entry,
    rank: index + 1,
    gap: index > 0 ? ranked[index - 1].points - entry.points : 0,
    isYou: entry.id === you.id,
  }));

  const chefsTable = seats.slice(0, 3);
  const theLine = seats.slice(3);

  return (
    <section aria-labelledby="phone-leaderboard-heading" className="mb-7 px-4">
      <p className="mono-label mb-2 text-pm-grey-text">Leaderboard</p>

      <div className="rounded-2xl bg-white px-3 pb-3 pt-4">
        {/* The menu's own head: title centred over its rubric, then a rule. */}
        <div className="px-1 text-center">
          <h2
            id="phone-leaderboard-heading"
            className="font-display text-[19px] font-semibold leading-tight text-zinc-900"
          >
            Friends&rsquo; Table
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Ranked by Plate Points
          </p>
        </div>
        <div className="mt-3 flex" aria-hidden="true">
          <span className={DOTS} />
        </div>

        <Course label="Chef's table" />
        <ol className="flex flex-col gap-0.5">
          {chefsTable.map((seat) => (
            <Seat key={seat.entry.id} {...seat} />
          ))}
        </ol>

        {theLine.length > 0 && (
          <>
            <Course label="The line" />
            <ol start={4} className="flex flex-col gap-0.5">
              {theLine.map((seat) => (
                <Seat key={seat.entry.id} {...seat} />
              ))}
            </ol>
          </>
        )}

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          Prices in Plate Points · no substitutions
        </p>
      </div>
    </section>
  );
}
