import { formatPoints } from "@/lib/points";
import { avatarPalette, initials } from "@/lib/format";
import { STATIONS } from "@/lib/stations";
import { PhoneSectionLabel } from "@/components/mobile/PhoneSectionLabel";

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
const DOTS = "h-px flex-1 border-b border-dotted border-pm-orange-border";

export type Seat = { entry: Entry; rank: number; gap: number; isYou: boolean };

/**
 * The one ranking, exported so the friends list above can badge each row with
 * the same `№` this card gives them. Two sorts of the same array is how a list
 * and the leaderboard under it end up disagreeing about who is second.
 */
export function rankSeats(friends: Entry[], you: Entry): Seat[] {
  const ranked = [...friends, you].sort((a, b) => b.points - a.points);
  return ranked.map((entry, index) => ({
    entry,
    rank: index + 1,
    gap: index > 0 ? ranked[index - 1].points - entry.points : 0,
    isYou: entry.id === you.id,
  }));
}

/**
 * A course heading, centred between two rules. `.mono-label` is unlayered in
 * globals.css and outranks Tailwind's font utilities, so this sets colour
 * only — a weight alongside it would be silently discarded.
 */
function Course({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 pt-4">
      <span aria-hidden="true" className={DOTS} />
      <span aria-hidden="true" className="text-[7px] leading-none text-pm-orange-border">
        ◆
      </span>
      <span className="mono-label text-pm-orange-text">{label}</span>
      <span aria-hidden="true" className="text-[7px] leading-none text-pm-orange-border">
        ◆
      </span>
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
  return standing;
}

/**
 * The podium's kitchen title, as a chip. Only the top three have one; everyone
 * below is just a number, per STATIONS. It used to ride the standing line,
 * which is where the longest text on the row already lives — as a chip it
 * reads at a glance and can carry the podium's colour. Tan for №2/№3 rather
 * than the orange tint, because that tint already means "this row is you" and
 * two meanings on one colour is how a legend stops working.
 */
function StationChip({ rank }: { rank: number }) {
  const station = STATIONS[rank];
  if (!station) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-px font-mono text-[10px] font-medium uppercase tracking-[0.1em] ${
        rank === 1 ? "bg-pm-orange text-[#F7F4EC]" : "bg-pm-grey-tint text-pm-grey-text"
      }`}
    >
      {station}
    </span>
  );
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
          rank <= 3 ? "text-pm-orange-text" : "text-zinc-500"
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
            {/* The unit, the way a price on a menu carries its currency. */}
            <span className="ml-0.5 text-[10px] font-medium text-pm-grey-text">PP</span>
            <span className="sr-only"> Plate Points</span>
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <StationChip rank={rank} />
          <span className="truncate font-mono text-[11px] leading-tight tabular-nums text-zinc-500">
            {standingFor(rank, gap)}
          </span>
        </span>
      </span>
    </li>
  );
}

export function PhoneFriendsLeaderboard({ friends, you }: { friends: Entry[]; you: Entry }) {
  if (friends.length === 0) return null;

  const seats = rankSeats(friends, you);

  const chefsTable = seats.slice(0, 3);
  const theLine = seats.slice(3);

  return (
    <section aria-labelledby="phone-leaderboard-heading" className="mb-7 px-4">
      <PhoneSectionLabel>Leaderboard</PhoneSectionLabel>

      {/* `overflow-hidden` so the header band takes the card's own corner
          radius instead of squaring off inside it. */}
      <div className="overflow-hidden rounded-2xl bg-white">
        {/* The cover. Charcoal rather than white because a menu's head is
            printed on the board, and because it gives the card a top edge
            without drawing a border to get one. Cream on charcoal is the
            highest-contrast pairing the app owns, which is what lets the
            title carry without spending the accent on it. */}
        <div className="bg-pm-charcoal px-4 py-4 text-center">
          <p className="mono-label text-pm-orange-tint">Tonight&rsquo;s service</p>
          <h2
            id="phone-leaderboard-heading"
            className="font-display mt-1.5 text-[21px] font-semibold leading-tight text-[#F7F4EC]"
          >
            Friends&rsquo; Table
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#bdb3a4]">
            Ranked by Plate Points
          </p>
        </div>

        <div className="px-3 pb-3">

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

          <div className="mt-4 flex" aria-hidden="true">
            <span className={DOTS} />
          </div>
          <p className="mt-2.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-pm-grey-text">
            Prices in Plate Points · no substitutions
          </p>
        </div>
      </div>
    </section>
  );
}
