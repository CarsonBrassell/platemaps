import Link from "next/link";
import type { CSSProperties } from "react";
import { PlusIcon } from "@/components/icons";
import { POINT_RULES, formatPoints } from "@/lib/points";
import { Avatar, Crown, platesToPass, plates, who } from "./parts";
import type { Seat } from "./types";

/**
 * The hook of the board: who is directly above you and what it costs, in
 * plates, to pass them — then the button that does it. When you lead, the
 * same space tells you by how much and who is closest behind.
 *
 * The rival is the nearest friend *strictly* ahead (ties are a catch, not a
 * chase) — the same rule `computeFriendRivals` uses for the post-award toast.
 */
export function RivalCallout({ seats, youSeat }: { seats: Seat[]; youSeat: Seat }) {
  const you = youSeat.entry.points;
  const ahead = seats.filter((s) => !s.isYou && s.entry.points > you);
  const rival = ahead.length ? ahead[ahead.length - 1] : null;
  const chaser = seats.find((s) => !s.isYou && s.entry.points <= you && s.rank > youSeat.rank) ?? null;

  const gap = rival ? rival.entry.points - you : 0;
  const n = rival ? platesToPass(gap) : 0;
  const podium = seats[2];
  const podiumPlates =
    rival && podium && youSeat.rank > 3 && podium !== rival ? platesToPass(podium.entry.points - you) : 0;

  return (
    <div className="lb-callout relative mx-3 mt-3 overflow-hidden rounded-2xl bg-pm-orange-tint p-4">
      {rival ? (
        <>
          <div className="flex items-center gap-3">
            <span className="lb-rival-face relative shrink-0">
              <Avatar entry={rival.entry} size={44} />
              <span className="lb-target" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mono-label text-pm-orange-text">Your rival</p>
              <p className="font-display mt-0.5 text-[20px] font-semibold leading-tight text-zinc-900">
                <span className="lb-big-num inline-block font-mono text-[26px] font-semibold text-pm-orange">
                  {n}
                </span>{" "}
                {n === 1 ? "plate" : "plates"} to pass{" "}
                <span className="break-words">{who(rival)}</span>
              </p>
            </div>
          </div>
          {n <= 8 && (
            <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: n }, (_, i) => (
                <span
                  key={i}
                  className="lb-pip"
                  style={{ "--lb-delay": `${500 + i * 90}ms` } as CSSProperties}
                />
              ))}
              <span className="lb-pip-flag ml-1 font-mono text-[10px] uppercase tracking-[0.12em] text-pm-orange-text">
                → №{rival.rank}
              </span>
            </div>
          )}
          <p className="mt-2.5 font-mono text-[11px] leading-snug tabular-nums text-pm-grey-text">
            {gap > 0 ? `${who(rival, true)} is ${formatPoints(gap)} PP ahead` : `Level with ${who(rival)}`} ·
            each plate +{POINT_RULES.createPost} PP
            {podiumPlates > 0 && ` · ${plates(podiumPlates)} to the podium`}
          </p>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Crown className="lb-crown-bob h-8 w-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[22px] font-semibold leading-tight text-zinc-900">
              You&rsquo;re <span className="text-pm-orange">№1</span>
            </p>
            <p className="mt-1 text-[13px] leading-snug text-zinc-900">
              {chaser
                ? chaser.entry.points < you
                  ? `${formatPoints(you - chaser.entry.points)} PP ahead of ${who(chaser)}. Post to stay ahead.`
                  : `Level with ${who(chaser)} — one plate breaks the tie.`
                : "Post to stay ahead."}
            </p>
          </div>
        </div>
      )}

      <Link
        href="/m/post"
        className="lb-cta mt-3.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-pm-orange px-5 text-[15px] font-semibold text-[#F7F4EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <PlusIcon className="h-4 w-4" />
        Post a plate
        <span className="rounded-full bg-[#F7F4EC]/20 px-2 py-0.5 font-mono text-[11px] font-medium">
          +{POINT_RULES.createPost} PP
        </span>
      </Link>
    </div>
  );
}
