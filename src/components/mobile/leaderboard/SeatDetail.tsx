import Link from "next/link";
import { formatPoints } from "@/lib/points";
import { PlusIcon } from "@/components/icons";
import { RankProgress, platesToPass, plates, who } from "./parts";
import type { Seat } from "./types";

const POST_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pm-orange px-4 text-xs font-medium text-[#F7F4EC] transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * What opens under a tapped seat: how far they are from the seat above, what
 * it would take *you* to pass them (or them to pass you), and their title
 * with a track toward the next one. Every line is arithmetic on the one
 * sorted array — no second source to disagree with.
 */
export function SeatDetail({ seat, seats, youSeat }: { seat: Seat; seats: Seat[]; youSeat: Seat }) {
  const above = seat.rank > 1 ? seats[seat.rank - 2] : null;
  const below = seats[seat.rank] ?? null;

  const standing = above
    ? seat.gap > 0
      ? `${formatPoints(seat.gap)} PP behind ${who(above)}`
      : `Level with ${who(above)}`
    : below && below.gap > 0
      ? `Leads by ${formatPoints(below.gap)} PP over ${who(below)}`
      : below
        ? `Sharing the lead with ${who(below)}`
        : "Leads the table";

  let push: string;
  let showPost = false;
  if (seat.isYou) {
    showPost = true;
    push = above
      ? `${plates(platesToPass(seat.gap))} to pass ${who(above)}.`
      : "Post to stay ahead.";
  } else if (seat.entry.points >= youSeat.entry.points) {
    const diff = seat.entry.points - youSeat.entry.points;
    showPost = true;
    push = `${diff > 0 ? `You're ${formatPoints(diff)} PP back. ` : "You're level. "}${plates(platesToPass(diff))} to pass ${who(seat)}.`;
  } else {
    const diff = youSeat.entry.points - seat.entry.points;
    push = `${formatPoints(diff)} PP behind you — ${plates(platesToPass(diff))} would put ${who(seat)} ahead.`;
  }

  return (
    <div className="lb-panel-in mx-1.5 mb-2 mt-0.5 rounded-xl bg-[#F7F4EC] p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-pm-grey-text">{standing}</p>
      <p className="mt-1.5 text-[13px] leading-snug text-zinc-900">{push}</p>
      <div className="mt-2.5">
        <RankProgress points={seat.entry.points} />
      </div>
      {showPost && (
        <Link href="/m/post" className={`${POST_LINK} mt-3`}>
          <PlusIcon className="h-3.5 w-3.5" />
          Post a plate
        </Link>
      )}
    </div>
  );
}
