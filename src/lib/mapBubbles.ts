/**
 * The map's bubbles, built once for both surfaces.
 *
 * `/feed`'s Map tab and `/m/feed`'s Map tab draw the same bubbles over the same
 * `RestaurantMap`, and until now they did it from two byte-identical copies of
 * the same `useMemo` — plus two copies of the caption parsers underneath it.
 * PhoneFeedMapPanel's own header called that out and said the parsers "belong
 * in `src/lib/` and should move there in one commit that updates both callers".
 * This is that module. Same rule `usePostFeed` already follows: one
 * implementation, two surfaces.
 *
 * ## Why the shape is an index and not a filter
 *
 * The old memo was `for (const restaurant of restaurants) posts.filter(...)` —
 * 5,701 restaurants × every post, re-run on **every vote**, because a vote
 * rewrites `posts` and `posts` is a dependency. That quadratic scan is a large
 * part of the multi-second main-thread block that made upvoting from a bubble
 * look broken: the request fired and the row landed, but the count could not
 * repaint until the scan finished.
 *
 * `indexPostsByRestaurant` does one pass over the posts instead, and the
 * per-restaurant loop becomes a Map lookup. It also resolves each post to the
 * one restaurant it was actually posted at rather than to every listing that
 * happens to share the name — see its own note. Feed order is preserved within
 * each bucket and `Array.prototype.sort` is stable, so a restaurant's bubbles
 * still stack in exactly the order they did.
 */

import type { Dish } from "@/data/dishes";
import type { Post } from "@/components/feed/types";
import { mapCommentsByRestaurant, withDishIds, type MapComment } from "@/data/mapComments";

/**
 * All a bubble needs to know about a restaurant: which one it is, and what it
 * is called (posts reference their restaurant by *name*, not id — see below).
 *
 * Deliberately structural rather than `MapRestaurant`: that type lives in
 * `RestaurantMap.tsx`, and a `src/lib/` module should not reach into a
 * component for a two-field shape. `MapRestaurant` satisfies this as-is.
 */
export type BubbleRestaurant = {
  id: string;
  name: string;
};

/* ---------------------------------------------------------------------------
 * Bubble text parsing.
 *
 * Moved verbatim out of `src/app/feed/page.tsx` and
 * `src/components/mobile/PhoneFeedMapPanel.tsx`, which each declared a private
 * copy. They are the read path for bubbles that predate structured post fields
 * and still encode rating and dish in the caption ("@Name 4 stars;").
 * ------------------------------------------------------------------------- */

function bubbleTextFromPost(text: string) {
  const match = text.match(/^@[^;]+;\s*/);
  return match ? text.slice(match[0].length) : text;
}

function ratingFromPost(text: string): string | null {
  const stars = text.match(/^@.*?\s(\d)\sstars?;/);
  return stars ? `${stars[1]}★` : null;
}

function dishNameFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s\d{1,3}%;/);
  return match ? match[1] : null;
}

function dishPrefixFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s(\d{1,3})%;/);
  return match ? `${match[1]} ${match[2]}%` : null;
}

/**
 * A post's dish name resolved against that restaurant's menu, so the bubble's
 * headline can deep-link to `/restaurant/<id>?dish=<dishId>`.
 *
 * Returns undefined when the menu has not loaded yet, which is now a routine
 * state rather than a rare one: menus are fetched per-restaurant *after* the
 * posts arrive (see `menuRestaurantIdsKey`). An undefined `dishId` costs the
 * headline its dish link and nothing else — RestaurantMap falls back to
 * `/restaurant/<id>` — so bubbles render immediately and gain their links when
 * the menus land.
 */
function findDishId(
  menus: Record<string, Dish[]>,
  restaurantId: string,
  dishName: string,
): string | undefined {
  return menus[restaurantId]?.find((d) => d.name.toLowerCase() === dishName.toLowerCase())?.id;
}

/**
 * A post's rating as a bubble's meta row shows it, always carrying the scale it
 * was measured on. Every rating written now is a percent, so that is what this
 * produces; the `restaurant` branch is the read path for rows written before
 * the star review was retired, and prints "4/5" with its denominator because
 * those are still 1-5. No 0-10 fallback exists, since that's what let an
 * impossible "9.2 stars" render. Never convert between the two — see CLAUDE.md's
 * rating-scale invariant.
 *
 * A percent lives in the dish prefix instead, so this returns null there —
 * unless the post has no dish name to hang it on, in which case the meta row is
 * the only place left for it to go.
 */
function bubbleRating(post: Post): string | null {
  if (post.rating === undefined) return ratingFromPost(post.text);
  if (post.ratingKind === "restaurant") return `${post.rating}/5`;
  if (post.ratingKind === "dish") return post.dishName ? null : `${post.rating}%`;
  return null;
}

/** The orange "Marlin taco 85%" prefix, in the dish review's own percent. */
function bubbleDishPrefix(post: Post): string | null {
  if (!post.dishName || post.rating === undefined) return dishPrefixFromPost(post.text);
  if (post.ratingKind === "dish") return `${post.dishName} ${post.rating}%`;
  // A restaurant review's stars belong to the place, not to a dish, so they
  // never get appended to a dish name.
  return post.dishName;
}

/** Posts grouped by the restaurant they were made at, keyed by id, in feed order. */
export type PostsByRestaurant = ReadonlyMap<string, Post[]>;

/**
 * One pass over the feed, grouping posts by the restaurant each was posted at.
 *
 * ## Why this is keyed by id and not by name
 *
 * It used to be by name — `p.restaurant === restaurant.name` — which is what a
 * post carries in free text and was the only join available before posts had
 * anything better. But a name is not an address: this corpus holds 200
 * Starbucks, 135 Subways and three Dirty Birds, so one plate posted at one of
 * them lit up a bubble over every other one, all claiming the same review.
 * A bubble is a statement about a place; it belongs over the place the person
 * was standing in and nowhere else.
 *
 * `placeId` is the resolution to use and it is already made: `resolvePostRefs`
 * in lib/discover.ts picks it server-side against the full corpus, by
 * `restaurantId` first and then a case-insensitive name match, and every feed
 * route the map reads runs posts through it. `restaurantId` is the fallback for
 * a post that reached here without going through that (nothing does today), and
 * both are checked against the restaurants actually being drawn, so an id that
 * no longer resolves can't silently swallow the post.
 *
 * ## The name fan-out survives as the last resort, and only there
 *
 * A post whose id resolves to nothing on this map still goes to every listing
 * whose name it names — exact match, as before. That path is what the old
 * behaviour was made of; keeping it means this change can only ever *narrow*
 * where a bubble appears, never make one vanish. Posts with no restaurant at
 * all are skipped, the same as when `undefined === restaurant.name` was the
 * test.
 */
export function indexPostsByRestaurant(
  posts: readonly Post[] | null,
  restaurants: readonly BubbleRestaurant[],
): PostsByRestaurant {
  const drawnIds = new Set<string>();
  // Every listing sharing a name, since the fallback below places a post on
  // all of them exactly as the old name join did.
  const idsByName = new Map<string, string[]>();
  for (const restaurant of restaurants) {
    drawnIds.add(restaurant.id);
    const sharing = idsByName.get(restaurant.name);
    if (sharing) sharing.push(restaurant.id);
    else idsByName.set(restaurant.name, [restaurant.id]);
  }

  const byId = new Map<string, Post[]>();
  function place(restaurantId: string, post: Post) {
    const bucket = byId.get(restaurantId);
    if (bucket) bucket.push(post);
    else byId.set(restaurantId, [post]);
  }

  for (const post of posts ?? []) {
    const resolved = post.placeId ?? post.restaurantId;
    if (resolved && drawnIds.has(resolved)) {
      place(resolved, post);
      continue;
    }
    if (!post.restaurant) continue;
    for (const id of idsByName.get(post.restaurant) ?? []) place(id, post);
  }
  return byId;
}

/**
 * Which restaurants actually need their menu fetched, as a comma-joined string.
 *
 * A menu is read for exactly two things — `findDishId` for a real post's dish
 * link, and `withDishIds` for a seeded bubble's — so only a restaurant that
 * *gets a bubble* needs one. That is the restaurants with at least one post,
 * plus the ones with seeded chatter in `mapCommentsByRestaurant`: 64 + ~19 as
 * this database stands, against the 5,701 whose entire dish table (10.5MB, 6s)
 * the map used to pull on mount.
 *
 * ## The set is *usually* one id per post, but not bounded by that
 *
 * A post that resolved to a place adds exactly its own restaurant, which is
 * what `indexPostsByRestaurant` now guarantees. A post that resolved to
 * nothing still falls back to the name join, and this corpus holds 200
 * Starbucks, 135 Subways, 104 McDonald's and 96 Jack in the Boxes — so a
 * handful of unresolved chain posts can still clear 500 ids on their own.
 * That is why `fetchMenus` below asks in batches rather than in one request:
 * the dishes route caps a request at 500 ids and REFUSES past it (a 400, not a
 * truncation), and one oversized ask would take every dish link on the map
 * down with it — on both surfaces at once. See MENU_IDS_PER_REQUEST.
 *
 * ## Why a string and not an array
 *
 * This is fed straight to the dishes effect's dependency list. An array would
 * be a fresh identity every render and would re-run the effect on every vote;
 * the joined string compares by value, so the effect only wakes when the *set*
 * changes — which a vote never does, since a vote alters a post's counts, not
 * which restaurants have posts. Sorted so that reordering upstream cannot
 * present the same set as a different key.
 */
export function menuRestaurantIdsKey(
  postsByRestaurant: PostsByRestaurant,
  restaurants: readonly BubbleRestaurant[],
): string {
  const ids: string[] = [];
  for (const restaurant of restaurants) {
    // `.has` rather than a length check: the index never stores an empty
    // bucket, so presence *is* "has at least one post".
    if (postsByRestaurant.has(restaurant.id) || mapCommentsByRestaurant[restaurant.id]) {
      ids.push(restaurant.id);
    }
  }
  return ids.sort().join(",");
}

/**
 * How many restaurant ids one `/api/restaurants/dishes` request carries.
 *
 * The route's own cap is `MAX_IDS = 500` and it answers 400 above it, so this
 * has to stay strictly under — and comfortably, not by one. 250 halves a
 * worst-case chain fan-out into two requests whose query strings are around
 * 1.5KB each, which is what that cap exists to bound in the first place. The
 * route's comment prescribes exactly this ("If a caller ever legitimately
 * needs more, it should ask in batches — do not raise this to paper over
 * one"); if the cap ever moves, this number is the other half of that change.
 */
export const MENU_IDS_PER_REQUEST = 250;

/** What one batched menu fetch came back with. */
export type MenuFetchResult = {
  /** Menus from the batches that succeeded, merged into one map. */
  menus: Record<string, Dish[]>;
  /**
   * Ids belonging to the batches that failed, and only those.
   *
   * The caller marks ids as requested *before* asking (see `requestedMenuIds`
   * at both call sites) so the same menu is never bought twice; these are the
   * ones to un-mark, so a later key change can retry them. Returning the whole
   * input on any failure would re-ask for menus already in hand, and returning
   * nothing would strand the failed ids as permanently "requested".
   */
  failedIds: string[];
};

/**
 * Menus for a set of restaurants, asked for in batches within the route's cap.
 *
 * Lives here rather than in either map surface because both need it and the
 * two effects are otherwise byte-identical — the same rule that moved the
 * bubble builders into this module.
 *
 * ## Partial failure is the interesting case
 *
 * The batches are independent requests, so one can fail while the rest land.
 * A menu that arrived is a menu, whichever request carried it, and the bubbles
 * it belongs to should get their dish links; only the ids that actually went
 * missing are handed back for retry. So this never rejects — a failed batch is
 * reported in `failedIds`, not thrown, and a total failure is simply every id
 * coming back.
 *
 * Issued in parallel: the browser's own per-origin connection limit (6) is a
 * better ration than anything invented here, and a real set is one or two
 * batches anyway. Merging into a shared object from several promises is safe
 * because JS runs them one continuation at a time.
 */
export async function fetchMenus(ids: readonly string[]): Promise<MenuFetchResult> {
  const menus: Record<string, Dish[]> = {};
  const failedIds: string[] = [];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += MENU_IDS_PER_REQUEST) {
    batches.push(ids.slice(i, i + MENU_IDS_PER_REQUEST));
  }
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `/api/restaurants/dishes?ids=${encodeURIComponent(batch.join(","))}`,
        );
        if (!res.ok) throw new Error(`dishes ${res.status}`);
        const { dishes } = (await res.json()) as { dishes: Record<string, Dish[]> };
        // Ids never collide across batches — they are slices of one set — so
        // the merge order is not load-bearing.
        Object.assign(menus, dishes);
      } catch {
        failedIds.push(...batch);
      }
    }),
  );
  return { menus, failedIds };
}

/**
 * The bubbles for every restaurant on the map, keyed by restaurant id.
 *
 * Still keyed for *every* restaurant, including the ones with nothing to say —
 * that is what the two memos produced and the output has to stay identical.
 * (RestaurantMap reads it as `commentsByRestaurant[id] ?? []`, so the empty
 * entries are not load-bearing, but this is a data-structure change and not a
 * behaviour one.)
 *
 * ## Why `source` decides whether the seeded chatter is drawn
 *
 * `mapCommentsByRestaurant` is authored flavour text — anonymous, upvote counts
 * invented by a hash, pinned to the 19 seeded restaurants. On Discover that is
 * filler among strangers' plates and reads as what it is. On Friends it breaks
 * the one promise that switch makes: everything on this map was said by someone
 * you are friends with. A bubble nobody you know wrote is as wrong there as a
 * stranger's real post would be, so on that source the map draws real friend
 * posts or nothing at all.
 */
export function buildMapComments(
  postsByRestaurant: PostsByRestaurant,
  restaurants: readonly BubbleRestaurant[],
  menus: Record<string, Dish[]>,
  source: "discover" | "friends" = "discover",
): Record<string, MapComment[]> {
  const out: Record<string, MapComment[]> = {};
  for (const restaurant of restaurants) {
    const menu = menus[restaurant.id] ?? [];
    const real: MapComment[] = (postsByRestaurant.get(restaurant.id) ?? [])
      .map((p) => {
        const parsedDish = dishNameFromPost(p.text);
        const dish = p.dishName ?? parsedDish ?? undefined;
        return {
          id: p.id,
          restaurantId: restaurant.id,
          text: bubbleTextFromPost(p.text),
          // Net, so the bubble and the card never disagree about a plate.
          score: p.upvoteCount - p.downvoteCount,
          upvotes: p.upvoteCount - p.downvoteCount,
          upvotedByMe: p.upvotedByMe,
          downvotedByMe: p.downvotedByMe,
          heartedByMe: p.heartedByMe,
          commentCount: p.comments.length,
          createdAt: p.createdAt,
          // Same "Maya Ellis" -> "mayaellis" reading the feed card uses.
          author: p.authorName.trim().toLowerCase().replace(/\s+/g, ""),
          rating: bubbleRating(p),
          dishPrefix: bubbleDishPrefix(p),
          postId: p.id,
          dishId: dish ? findDishId(menus, restaurant.id, dish) : undefined,
        };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    // The seeded bubbles name their dish rather than carrying its id, since
    // menus are database rows now — resolved here against the menu this
    // restaurant actually has. See withDishIds. Discover only — on Friends
    // the audience filter is the whole point of the surface (see above).
    const seeded =
      source === "discover"
        ? withDishIds(mapCommentsByRestaurant[restaurant.id] ?? [], menu)
        : [];
    out[restaurant.id] = [...real, ...seeded];
  }
  return out;
}
