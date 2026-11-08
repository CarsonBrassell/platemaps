"use client";

import { RestaurantCard, type MatchMarks } from "@/components/RestaurantCard";
import type { RestaurantView } from "@/data/restaurantTypes";
import type { PlateScore } from "@/lib/plateScore";
import type { QualityNote } from "@/lib/ratingDisplay";

/**
 * A restaurant card with the two feedback buttons under it: the card every
 * personal list is made of. Your taste (the carousel on Discover) and the For
 * me list use this one wrapper, so a "Been here" / "Not for me" looks and
 * behaves the same wherever it is tapped. See probe/for-me/PLAN.md.
 *
 * The card knows nothing about useTaste: the caller wires the buttons, so the
 * Your taste carousel can send the op through its own hook while the For me
 * list also takes the card off its grid and offers the Undo.
 *
 * The buttons sit outside the card's link (the whole card is one `<Link>`, and
 * a button inside an anchor is invalid), in a footer that pins to the bottom
 * so a row of uneven cards still lines its buttons up.
 */
export const TASTE_BTN =
  "text-[13px] font-medium text-zinc-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function TastePickCard({
  restaurant,
  score,
  reason,
  friends,
  quality,
  distance,
  shape = "crop",
  match,
  onBeen,
  onHide,
  className = "",
}: {
  restaurant: RestaurantView;
  score?: PlateScore | null;
  /** The one line that says why this place is here. */
  reason?: string | null;
  /** For me only: friends' first names, when one has been ("Ana and Ben have been"). */
  friends?: string | null;
  /** For me only: why the place is good, in words ("Highly rated · 1,017 reviews"). */
  quality?: QualityNote | null;
  /** How far from the visitor, from `distanceLabel`; null or omitted prints nothing. */
  distance?: string | null;
  shape?: "crop" | "natural";
  /** What the active filters matched, for the lit-up cuisine / price marks. */
  match?: MatchMarks;
  onBeen: () => void;
  onHide: () => void;
  /** Width and flex behaviour from the layout the card is dropped into. */
  className?: string;
}) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-white ${className}`}>
      <div className="flex-1">
        <RestaurantCard
          restaurant={restaurant}
          score={score ?? undefined}
          shape={shape}
          match={match}
          reason={reason}
          friends={friends}
          quality={quality}
          distance={distance}
        />
      </div>
      <div className="mt-auto px-3.5 pb-3">
        <div className="flex gap-4">
          <button type="button" onClick={onBeen} className={TASTE_BTN}>
            Been here
          </button>
          <button type="button" onClick={onHide} className={TASTE_BTN}>
            Not for me
          </button>
        </div>
      </div>
    </div>
  );
}
