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
import type { RestaurantAspectTally } from "@/lib/db";
import type { PlateScore, RatedDish } from "@/lib/plateScore";
import { dishRatingKey } from "@/lib/dishRatingKey";
import { mapCommentsByRestaurant, withDishIds } from "@/data/mapComments";

/* Eight, so the grid's two columns come out even — seven left a widowed card
   on the last row. This is the whole of "the hits": a plate outside it is still
   in the full menu below with its percent, just not promoted. */
const TOP_PICKS_COUNT = 8;
const COMMENTS_ANCHOR = "restaurant-comments";

export function RestaurantDetail({
  restaurant,
  dishes,
  aspectTally,
  plateScore,
  dishRatings,
}: {
  restaurant: Restaurant;
  /**
   * The menu, already read from Postgres by the page. Menus are extracted
   * ahead of time rather than on demand, so this is simply the menu — there is
   * no loading state and nothing for the reader to trigger.
   */
  dishes: Dish[];
  /** Read server-side in the page — see the note there. */
  aspectTally: RestaurantAspectTally;
  /** What this restaurant's plates add up to. Also read server-side. */
  plateScore: PlateScore;
  /** Per-plate rating averages, keyed by `dishRatingKey`. Also server-side. */
  dishRatings: Record<string, RatedDish>;
}) {
  const searchParams = useSearchParams();
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null);

  /* The composer, opened holding this restaurant — the comment field's
     destination. The "where were you?" step is already answered because the
     reader is standing in the place. `/m` has its own copy of this. */
  const postHref = `/post?restaurant=${encodeURIComponent(restaurant.id)}`;

  // Deep link from a map comment bubble ("view this dish in the menu").
  useEffect(() => {
    const dishId = searchParams.get("dish");
    if (dishId && dishes.some((dish) => dish.id === dishId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDishId(dishId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /**
   * Each plate's percent, and how many people it came from.
   *
   * A plate someone has actually rated shows **its rating average** — the same
   * numbers the header's percent is the average of, so the page adds up. A
   * plate nobody has rated falls back to the older "would you eat this?" yes/no
   * tally, which is the only signal those rows have.
   *
   * The fallback is transitional and not something to build on: the two are
   * different questions ("how good was this, 0-100" against "what share would
   * order it again") wearing the same percent sign, and only the first is on the
   * product's rating scale. It exists so restaurants whose plates aren't rated
   * yet keep a populated menu instead of going blank overnight.
   *
   * **It is now read-only.** The dish sheet's yes/no buttons were the only way
   * to cast one and they are gone, so these counts are whatever the import left
   * and can no longer move. The stored tally still renders; nothing adds to it.
   */
  const dishesWithStats = useMemo(
    () =>
      dishes.map((dish) => {
        const rated = dishRatings[dishRatingKey(dish.name)];
        if (rated) {
          return { ...dish, total: rated.ratings, pct: Math.round(rated.average) };
        }
        const { total, pct } = dishStats(dish.yesVotes, dish.noVotes);
        return { ...dish, total, pct };
      }),
    [dishes, dishRatings],
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

  // Everyone who has weighed in on a dish here — the denominator behind the
  // hits grid's footer line.
  const ratedBy = dishesWithStats.reduce((sum, dish) => sum + dish.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <RestaurantHeader restaurant={restaurant} score={plateScore} />

      {/* The thread used to start below the full menu, which on a long menu put
          it a screen or more down. On lg it moves into a rail beside the picks
          and the menu; below lg the columns collapse back to the original
          stacked order. The rail sticks and scrolls on its own so the comments
          stay in view however far down the menu the reader gets. */}
      <div className="lg:flex lg:items-start lg:gap-4">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
          <TopPicks dishes={topPicks} ratedBy={ratedBy} onSelect={setSelectedDishId} />
          <RestaurantAspects tally={aspectTally} />
          <FullMenu sections={sections} onSelect={setSelectedDishId} />
        </div>
        {/* The rail is the comment thread and nothing else now — the booking
            prototype that used to be pinned above it is deleted (PRODUCT.md).
            The thread takes the full height and scrolls on its own. */}
        {/* `self-stretch` against the row's `items-start` is what makes the
            sticky box below actually stick: a sticky element can only travel
            inside its containing block, and without this the wrapper is exactly
            as tall as the box it holds — zero travel, so the rail scrolled away
            with the page however long the menu got. */}
        <div className="mt-4 lg:mt-0 lg:w-[400px] lg:shrink-0 lg:self-stretch">
          <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
            {/* The anchor is on the thread itself — "see all comments" from the
                dish sheet has to land on the comments. */}
            <div
              id={COMMENTS_ANCHOR}
              className="scroll-mt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            >
              <RestaurantComments restaurant={restaurant} postHref={postHref} />
            </div>
          </div>
        </div>
      </div>
      {selectedDish && (
        <DishSheet
          dish={selectedDish}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          comments={selectedDishComments}
          onClose={() => setSelectedDishId(null)}
          onSeeAll={handleSeeAllComments}
        />
      )}
    </div>
  );
}
