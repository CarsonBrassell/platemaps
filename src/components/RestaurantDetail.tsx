"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Restaurant } from "@/data/restaurants";
import { dishStats, type Dish } from "@/data/dishes";
import { RestaurantHeader } from "@/components/RestaurantHeader";
import { TopPicks } from "@/components/TopPicks";
import { FullMenu } from "@/components/FullMenu";
import { DishSheet } from "@/components/DishSheet";
import { RestaurantComments } from "@/components/RestaurantComments";
import { RestaurantAspects } from "@/components/RestaurantAspects";
import { ReservationPanel } from "@/components/ReservationPanel";
import type { RestaurantAspectTally } from "@/lib/db";
import { mapCommentsByRestaurant, withDishIds } from "@/data/mapComments";

const TOP_PICKS_COUNT = 7;
const COMMENTS_ANCHOR = "restaurant-comments";

export function RestaurantDetail({
  restaurant,
  dishes,
  aspectTally,
}: {
  restaurant: Restaurant;
  dishes: Dish[];
  /** Read server-side in the page — see the note there. */
  aspectTally: RestaurantAspectTally;
}) {
  const searchParams = useSearchParams();
  const [myVotes, setMyVotes] = useState<Record<string, "yes" | "no" | undefined>>({});
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

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

  // Comments already tagged to this dish, newest first.
  //
  // The seed bubbles name their dish rather than carrying its id, since menus
  // live in the database now and the id can only be resolved against a menu
  // that has been loaded — `dishes` here is that menu. See withDishIds.
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
  // hits grid's footer line.
  const ratedBy = dishesWithStats.reduce((sum, dish) => sum + dish.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <RestaurantHeader restaurant={restaurant} />

      {/* The thread used to start below the full menu, which on a long menu put
          it a screen or more down. On lg it moves into a rail beside the picks
          and the menu; below lg the columns collapse back to the original
          stacked order. The rail sticks and scrolls on its own so the comments
          stay in view however far down the menu the reader gets. */}
      <div className="lg:flex lg:items-start lg:gap-4">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
          {/* The dishes lead. Booking a table is a side errand next to what to
              order, so it sits in the rail rather than above the picks. */}
          <TopPicks dishes={topPicks} ratedBy={ratedBy} onSelect={setSelectedDishId} />
          <RestaurantAspects tally={aspectTally} />
          <FullMenu sections={sections} onSelect={setSelectedDishId} />
        </div>
        {/* The rail is a column of its own: the booking card is pinned at the
            top of it and the comments take whatever height is left and scroll,
            so neither pushes the other out of view. */}
        {/* `self-stretch` against the row's `items-start` is what makes the
            sticky box below actually stick: a sticky element can only travel
            inside its containing block, and without this the wrapper is exactly
            as tall as the box it holds — zero travel, so the rail scrolled away
            with the page however long the menu got. */}
        <div className="mt-4 lg:mt-0 lg:w-[400px] lg:shrink-0 lg:self-stretch">
          <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col lg:gap-4">
            <ReservationPanel
              restaurantId={restaurant.id}
              closingTime={restaurant.closingTime}
            />
            {/* The anchor stays on the comments themselves — "see all comments"
                from the dish sheet must land on the thread, not on the booking
                card above it. */}
            <div
              id={COMMENTS_ANCHOR}
              className="mt-4 scroll-mt-4 lg:mt-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            >
              <RestaurantComments restaurant={restaurant} dishes={dishes} />
            </div>
          </div>
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
