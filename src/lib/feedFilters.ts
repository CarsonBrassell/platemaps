/**
 * Searching the feed.
 *
 * ## What a term is matched against
 *
 * Everything on the plate, not just its restaurant. Discover's `q` matches a
 * restaurant's name, cuisine and neighbourhood, which is the right reading for
 * a grid of restaurants and the wrong one for a feed: what is on screen here is
 * what people *wrote*. So a term is matched against the caption, the dish, the
 * author, the tags, the restaurant *and every comment on the post*.
 *
 * "mexican" therefore finds three different things at once — the plate at a
 * Mexican restaurant, the plate captioned "best mexican in town", and the plate
 * whose comment thread is arguing about it. Before this, it found none of them:
 * the only search on the feed was the header's, which left the feed for
 * Discover, and the phone's, which matched a restaurant name and a dish name
 * and nothing else.
 *
 * ## Where the restaurant comes from
 *
 * A post carries the plain name of its restaurant and, usually, a soft
 * reference to its id — neither of which says what cuisine it serves. The feed
 * routes resolve each post against the restaurant corpus and send the few
 * fields the haystack reads, keyed by restaurant id and deduplicated across
 * posts (`placesForPosts` in lib/discover.ts). So searching costs the feed no
 * extra request, which is what lets it stay client-side: the list is a bounded
 * rolling window that is already fully loaded, and re-asking the server for a
 * term would be a round trip to narrow something the browser is holding.
 *
 * A post whose restaurant isn't in the corpus still searches fine — its own
 * name, caption and comments are all still there. It just can't be found by a
 * cuisine nobody typed.
 */

import type { Post } from "@/components/feed/types";

/**
 * What a post's restaurant contributes to a search, as the feed routes send it.
 *
 * Four fields, not a `RestaurantView`: this is per-restaurant payload on every
 * feed response, and the reader is a substring match. The rest of the row —
 * hours, ratings, photos, the price band — answers questions the feed does not
 * ask.
 */
export type FeedPlace = {
  id: string;
  name: string;
  cuisine: string;
  neighborhood: string;
};

/** Every restaurant the loaded feed touches, by id. */
export type FeedPlaces = Record<string, FeedPlace>;

/** The place a post is about, or undefined when it isn't a listed restaurant. */
export function placeOf(post: Post, places: FeedPlaces): FeedPlace | undefined {
  return post.placeId ? places[post.placeId] : undefined;
}

/**
 * Everything on a plate a search term can land in, lowercased once.
 *
 * Cached on the post object, which is safe because the posts and the places
 * they resolve against arrive in the same response — a given `Post` instance
 * never sees two different restaurants. Optimistic patching in `usePostFeed`
 * replaces the object, so posting a comment produces a new post and a fresh
 * haystack that contains it.
 */
const HAYSTACK = new WeakMap<Post, string>();

export function haystackFor(post: Post, place: FeedPlace | undefined): string {
  let text = HAYSTACK.get(post);
  if (text === undefined) {
    const parts = [
      post.text,
      post.dishName,
      post.restaurant,
      post.authorName,
      post.locationLabel,
      post.vibe,
      place?.name,
      place?.cuisine,
      place?.neighborhood,
      // The comment threads, which is the half of a plate no search in the app
      // reached before — "someone in here said the al pastor is the move" is a
      // real thing to go looking for.
      ...post.comments.flatMap((c) => [c.text, c.authorName]),
    ];
    /* Joined on a gap wide enough that two adjacent fields can't be read as one
       run of text — without it, a dish "Al" beside an author "Pastor" would
       answer a search for "al pastor". */
    text = parts.filter(Boolean).join("   ").toLowerCase();
    HAYSTACK.set(post, text);
  }
  return text;
}

/**
 * Every word has to land somewhere, but not all of them in the same place:
 * "mexican tacos" matches the plate at a Mexican restaurant captioned "best
 * tacos". Demanding one field hold the whole phrase would match almost nothing.
 */
export function matchesQuery(haystack: string, q: string): boolean {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

/** The posts matching `q`, in the order they arrived. An empty term matches all. */
export function searchFeed(
  posts: readonly Post[],
  places: FeedPlaces,
  q: string | null,
): Post[] {
  const term = q?.trim();
  if (!term) return [...posts];
  return posts.filter((post) => matchesQuery(haystackFor(post, placeOf(post, places)), term));
}
