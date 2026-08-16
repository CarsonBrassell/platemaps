"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Restaurant } from "@/data/restaurants";
import { dishStats, type Dish } from "@/data/dishes";
import { DishSheet } from "@/components/DishSheet";
import { FullMenu } from "@/components/FullMenu";
import { ReservationPanel } from "@/components/ReservationPanel";
import { RestaurantAspects } from "@/components/RestaurantAspects";
import { RestaurantComments } from "@/components/RestaurantComments";
import { PhoneDetailHero } from "@/components/mobile/PhoneDetailHero";
import { PhoneDetailHits } from "@/components/mobile/PhoneDetailHits";
import type { RestaurantAspectTally } from "@/lib/db";
import type { PlateScore } from "@/lib/plateScore";
import { mapCommentsByRestaurant, withDishIds } from "@/data/mapComments";

/**
 * The restaurant screen, phone version.
 *
 * This is `RestaurantDetail` re-laid-out, and deliberately not re-derived: the
 * dish stats, the pick ordering, the section grouping, the optimistic local
 * vote and the `?dish=` deep link are all lifted from it verbatim, because two
 * implementations of "which dishes are the hits" is exactly the kind of drift
 * that makes the two versions of the site disagree about the same restaurant.
 * If any of that logic needs to change it changes in both, or better, moves to
 * `lib/`.
 *
 * What is genuinely different is the layout, and there is only one axis of it:
 *
 * - **The web page has two columns from `lg` and this has one.** The rail —
 *   booking pinned above a scrolling comment thread — has nowhere to go at
 *   390px, so the order here is the web page's own *stacked* order, the one it
 *   collapses to below `lg`: hits, aspects, menu, booking, comments. Nothing is
 *   resequenced for the phone; the phone is simply always in the narrow case.
 * - **`THE HITS` is a single column** (`PhoneDetailHits`) rather than the web's
 *   two-column grid — see that file.
 * - **The hero is full-bleed** (`PhoneDetailHero`) rather than a photo inset in
 *   a white card.
 *
 * Everything else is the web component, unchanged: `RestaurantAspects` is a
 * `auto-fit` grid that already wraps, `FullMenu` is a single column of rows with
 * 44px targets, `RestaurantComments` is a single column of avatars and prose,
 * and `DishSheet` is already a bottom sheet with safe-area padding. Rebuilding
 * any of them as a `Phone*` variant would have been four more files to keep in
 * step for no visual difference at this width.
 */

const TOP_PICKS_COUNT = 7;
const COMMENTS_ANCHOR = "restaurant-comments";

export function PhoneDetailScreen({
  restaurant,
  dishes,
  aspectTally,
  plateScore,
}: {
  restaurant: Restaurant;
  /** The menu, already read from Postgres by the page. */
  dishes: Dish[];
  /** Read server-side in the page — see the note there. */
  aspectTally: RestaurantAspectTally;
  /** What this restaurant's plates add up to. Also read server-side. */
  plateScore: PlateScore;
}) {
  const searchParams = useSearchParams();
  const [myVotes, setMyVotes] = useState<Record<string, "yes" | "no" | undefined>>({});
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

  /* Back always lands inside `/m`, and carries `?nav=` with it — the nav
     variant travels in the URL, so dropping it here would bounce the reader
     onto the default nav on the way home. Same rule PhoneNav's `to()` follows;
     both disappear when the variant switcher does. */
  const nav = searchParams.get("nav");
  const backHref = nav ? `/m?nav=${nav}` : "/m";

  // Deep link from a map comment bubble ("view this dish in the menu").
  useEffect(() => {
    const dishId = searchParams.get("dish");
    if (dishId && dishes.some((dish) => dish.id === dishId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDishId(dishId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const dishesWithStats = useMemo(
    () =>
      dishes.map((dish) => {
        const myVote = myVotes[dish.id];
        const yesVotes = dish.yesVotes + (myVote === "yes" ? 1 : 0);
        const noVotes = dish.noVotes + (myVote === "no" ? 1 : 0);
        const { total, pct } = dishStats(yesVotes, noVotes);
        return { ...dish, total, pct };
      }),
    [dishes, myVotes],
  );

  const topPicks = useMemo(
    () =>
      [...dishesWithStats]
        .filter((dish) => dish.total > 0)
        .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.total - a.total)
        .slice(0, TOP_PICKS_COUNT),
    [dishesWithStats],
  );

  const sections = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, typeof dishesWithStats>();
    for (const dish of dishesWithStats) {
      if (!bySection.has(dish.section)) {
        order.push(dish.section);
        bySection.set(dish.section, []);
      }
      bySection.get(dish.section)!.push(dish);
    }
    return order.map((section) => ({ section, dishes: bySection.get(section)! }));
  }, [dishesWithStats]);

  const selectedDish = selectedDishId
    ? dishesWithStats.find((dish) => dish.id === selectedDishId)
    : undefined;

  // Comments already tagged to this dish, newest first. The seed bubbles name
  // their dish rather than carrying its id — see withDishIds.
  const selectedDishComments = useMemo(() => {
    if (!selectedDishId) return [];
    return withDishIds(mapCommentsByRestaurant[restaurant.id] ?? [], dishes)
      .filter((comment) => comment.dishId === selectedDishId)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [restaurant.id, selectedDishId, dishes]);

  /** Close the sheet and drop the reader at the full comment thread. */
  function handleSeeAllComments() {
    setSelectedDishId(null);
    // Wait for the sheet to unmount so the anchor is actually in the layout.
    requestAnimationFrame(() => {
      document
        .getElementById(COMMENTS_ANCHOR)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleVote(vote: "yes" | "no") {
    if (!selectedDishId) return;
    setMyVotes((prev) => ({
      ...prev,
      [selectedDishId]: prev[selectedDishId] === vote ? undefined : vote,
    }));
  }

  // Everyone who has weighed in on a dish here — the denominator behind the
  // hits list's footer line.
  const ratedBy = dishesWithStats.reduce((sum, dish) => sum + dish.total, 0);

  return (
    <div>
      <PhoneDetailHero restaurant={restaurant} score={plateScore} backHref={backHref} />

      {/* The hero owns its own padding because its photo is full-bleed;
          everything below it is a card on the cream, inset by the same 16px the
          discover list uses. No bottom padding — PhoneShell's
          `--phone-nav-space` already reserves the arc nav's room. */}
      <div className="flex flex-col gap-5 px-4 pt-5">
        <PhoneDetailHits dishes={topPicks} ratedBy={ratedBy} onSelect={setSelectedDishId} />
        <RestaurantAspects tally={aspectTally} />
        <FullMenu sections={sections} onSelect={setSelectedDishId} />
        {/* The booking prototype, in the position the web page puts it in when
            its rail collapses: after the menu, before the thread. Its numbers
            are mocked and the card says so on its face — that disclaimer is the
            condition PRODUCT.md sanctions it under, and it travels with it. */}
        <ReservationPanel restaurantId={restaurant.id} hours={restaurant.hours ?? null} />
        {/* The anchor is on the thread itself — "see all comments" from the dish
            sheet must land on the comments, not on the card above them. */}
        <div id={COMMENTS_ANCHOR} className="scroll-mt-4">
          <RestaurantComments restaurant={restaurant} dishes={dishes} />
        </div>
      </div>

      {selectedDish && (
        <DishSheet
          dish={selectedDish}
          restaurantName={restaurant.name}
          myVote={myVotes[selectedDish.id]}
          comments={selectedDishComments}
          onVote={handleVote}
          onClose={() => setSelectedDishId(null)}
          onSeeAll={handleSeeAllComments}
        />
      )}
    </div>
  );
}
