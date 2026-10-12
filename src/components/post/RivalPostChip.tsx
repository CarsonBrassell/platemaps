"use client";

import { PlateStarIcon } from "@/components/icons";
import { firstName, useFriendRivals } from "@/lib/friendRivals";
import { POINT_RULES, formatPoints } from "@/lib/points";
import "@/components/mobile/rivals.css";

/**
 * What this plate does to the Friends' Table, said beside "Post it".
 *
 * Display only: it reads the cached standings and the points rule and never
 * touches the composer's state, validation or payload. It also warms the
 * friends cache before the publish, which is what lets the overtake toast on
 * the feed compare against the standings you posted from.
 *
 * Nothing is drawn with no friends, signed out, or on a failed fetch.
 */
export function RivalPostChip() {
  const rivals = useFriendRivals();
  if (!rivals) return null;

  const earn = POINT_RULES.createPost;
  const { rival, gap, toPass, chaser, lead } = rivals;

  let tone: "pass" | "chase" | "lead";
  let text: React.ReactNode;
  if (rival && toPass <= earn) {
    tone = "pass";
    text = (
      <>
        passes <span className="rival-chip-name">{firstName(rival.name)}</span>!
      </>
    );
  } else if (rival) {
    tone = "chase";
    text = (
      <>
        <span className="font-mono tabular-nums">{formatPoints(gap)}</span> behind{" "}
        <span className="rival-chip-name">{firstName(rival.name)}</span>
      </>
    );
  } else if (chaser) {
    tone = "lead";
    text = (
      <>
        lead <span className="rival-chip-name">{firstName(chaser.name)}</span> by{" "}
        <span className="font-mono tabular-nums">{formatPoints(lead + earn)}</span>
      </>
    );
  } else {
    return null;
  }

  return (
    <p className="px-4 pt-2">
      <span className={`rival-chip rival-chip--${tone}`}>
        <span className="rival-chip-earn font-mono tabular-nums">
          <PlateStarIcon className="h-3.5 w-4" />+{earn} PP
        </span>
        <span aria-hidden className="rival-chip-dot">
          ·
        </span>
        <span>{text}</span>
      </span>
    </p>
  );
}
