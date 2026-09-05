/**
 * The shared vocabulary between the fetch scripts, the database layer and the
 * UI. Importing a type from here compiles to nothing.
 *
 * These lived in `data/restaurants.ts` until that file grew to 17,000 lines of
 * seed rows, which meant every reader looking for a 40-line interface opened
 * the whole corpus. The seed array stays there and still re-exports these
 * names; new code should import them from this file.
 */

import type { PriceBand } from "@/data/priceBands";
import type { Hours } from "@/lib/openState";

export type Restaurant = {
  id: string;
  /**
   * Stable identity across data refreshes, as `<source>:<id>` — see
   * `src/lib/sourceKey.ts`. This is what the fetch scripts merge on, so that a
   * re-run updates a restaurant in place instead of appending a second copy
   * and splitting its posts between the two.
   *
   * Optional in the type, always written in practice. Every row here carries
   * one, and both serializers that rewrite this array emit it; the optionality
   * exists because `sourceKeyFor()` can still recover the key from `yelpUrl`
   * for the Yelp-sourced rows, so a row that somehow loses it degrades to the
   * old behaviour rather than becoming unmatchable.
   */
  sourceKey?: string;
  name: string;
  /** Canonical, or null when none was ever given — see `RestaurantView`. */
  cuisine: string | null;
  /** The specific labels, joined, for search — see `RestaurantView`. */
  cuisineTags?: string;
  /**
   * What this row arrived with, verbatim, before the vocabulary in
   * data/cuisines.ts collapsed it. Kept so the collapse stays reversible: the
   * backfill re-reads this rather than the already-canonical value, so
   * revising the vocabulary is an edit and a re-run, not a re-import.
   */
  cuisineRaw?: string;
  neighborhood: string;
  distance: string;
  walkTime: string;
  /**
   * Today's closing time as prose, e.g. "Closes 10pm".
   *
   * Superseded by `hours` and kept only because the Yelp fetcher still writes
   * it. Nothing should render or reason about it: one closing time cannot say
   * when a place *opens*, which is how every dinner-only restaurant came to
   * report itself open at breakfast. See lib/openState.ts.
   */
  closingTime: string;
  /** The real weekly schedule, written by scripts/fetch-hours.mjs. */
  hours?: Hours;
  lat: number;
  lng: number;
  status: "calm" | "urgent";
  statusLabel: string;
  /**
   * Review-count-weighted blend of the source ratings below, written by
   * `scripts/blend-ratings.mjs`. Where no Google match was found this is just
   * the Yelp rating.
   *
   * **Optional, and undefined means "not sourced yet" — never zero.** A
   * restaurant arriving from OpenStreetMap has no rating at all: OSM has no
   * such field, and one is fetched from Google afterwards. Writing 0 or a
   * placeholder would put a number on the page that nobody measured, which is
   * the failure PRODUCT.md exists to prevent.
   *
   * `restaurants.listed` no longer guarantees a rating — the publish gate
   * (see scripts/publish-restaurants.mjs) requires a real menu but not a
   * sourced rating, so a listed restaurant can still carry a null one here.
   * `RestaurantView.rating` is typed `number | null` to match: every reader
   * has to handle the absence rather than assume the gate did it for them.
   */
  rating?: number;
  reviewCount?: number;
  /**
   * The component ratings behind `rating`, kept so any figure the app shows
   * can be traced back to what produced it. Nothing renders these.
   */
  yelpRating?: number;
  yelpReviewCount?: number;
  googleRating?: number;
  googleReviewCount?: number;
  trending?: boolean;
  /**
   * Optional photo. Omit it and cards fall back to the utensils placeholder,
   * so photos can be filled in one restaurant at a time.
   *
   * Local files live in `public/` and are referenced from the web root, e.g.
   * `/restaurants/mariscos-german.jpg`. A remote URL also works, but the host
   * has to be allowed in `next.config.ts` first — see the note there.
   */
  photo?: string;
  /**
   * Describes what the photo shows, for screen readers. Leave it unset unless
   * the photo carries information the restaurant name doesn't — see the note
   * in `RestaurantPhoto`.
   */
  photoAlt?: string;
  /**
   * Link back to the source of `photo`. Yelp requires attribution when you show
   * their content, so this is set alongside `photo` by `scripts/fetch-photos.mjs`
   * and rendered as a credit link.
   */
  yelpUrl?: string;
  /**
   * Street address, e.g. "3750 Sports Arena Blvd, San Diego, CA 92110".
   *
   * Written by whichever source found the restaurant first — Yelp's search
   * response carries it, Google's carries it, and OpenStreetMap tags it on 65%
   * of San Diego venues — so it costs no extra request anywhere.
   *
   * Not on `RestaurantView`. The grid shows a neighbourhood, which is what
   * someone deciding between restaurants wants; a street address only matters
   * once they have decided, and by then they are on the detail page. Putting it
   * on the view would send ~40 bytes per restaurant to every visitor for a line
   * the grid does not draw.
   */
  address?: string;
};

/**
 * A restaurant as the *list* surfaces render it — Discover's grid and rail, the
 * feed map, the composer's picker.
 *
 * Spelled out field by field rather than written as `Restaurant & { priceBand }`,
 * because the difference is the point: every field here is downloaded by every
 * visitor, once per restaurant, since the components that render them are
 * client components. `Restaurant` carries eight more — `walkTime`, `status`,
 * `statusLabel`, `yelpUrl` and the four Yelp/Google component ratings that the
 * type above already notes nothing renders. Those are real data and the detail
 * page (`getRestaurantById`) still returns them; they just have no business
 * being sent 36 times, or five thousand times, to draw a grid that ignores them.
 *
 * Adding a field here is not free. Check that something actually renders it.
 *
 * `priceBand` is the one field that is not a column: it is computed from the
 * dishes table each time the row is assembled (see `getRestaurants`), because
 * it summarises menu prices rather than describing the business.
 */
/**
 * One dish off a restaurant's menu, as a search result carries it.
 *
 * Deliberately two fields. The card prints a name and a price and nothing
 * else, and this type travels on every row of a dish-shaped search response —
 * a description or a section would be bytes per restaurant that nothing
 * renders.
 */
export type MatchedDish = {
  name: string;
  /** Null when the menu listed no price, which is common. */
  price: string | null;
};

export type RestaurantView = {
  id: string;
  name: string;
  /**
   * One of the canonical cuisines in data/cuisines.ts, or null.
   *
   * **Null is normal.** Roughly 400 listed restaurants arrived from
   * OpenStreetMap with no `cuisine=` tag at all, and null is how that absence
   * is now recorded — it used to be the literal string "Restaurant", which
   * made a missing answer look like a category and put a 382-row "Restaurant"
   * option in the Discover facet. Every renderer needs a story for the
   * absence; `placeLine` in lib/placeLine.ts is that story.
   */
  cuisine: string | null;
  /**
   * The specific labels this row arrived with, joined into one string — a
   * search haystack, never a list to render.
   *
   * It exists because the filter vocabulary is deliberately blunt and search
   * must not be. A shop tagged `taco` now files under Mexican, and this is
   * what still lets someone typing "tacos" find it. Joined text rather than
   * `text[]` for the trigram index's sake; see scripts/migrate.mjs.
   */
  cuisineTags: string;
  /**
   * The dish that made this restaurant a search result, when one did.
   *
   * **Set only by a search**, and undefined everywhere else — browsing the
   * grid unfiltered, there is no such thing as "the matched dish". It is on
   * the row rather than fetched by the card because a query like "california
   * burrito" returns 184 restaurants, and without the dish and its price on
   * each card the result is an indistinguishable wall of "Mexican · Barrio
   * Logan". The dish is the reason the row is there, so it has to be visible
   * before the click, not after it.
   *
   * `price` is null for a dish whose menu listed none — common enough that a
   * renderer must handle it rather than print an empty pair of characters.
   */
  matchedDish?: MatchedDish;
  neighborhood: string;
  distance: string;
  /**
   * The weekly schedule, not a closing time. Costs roughly 250 bytes a row
   * against the 14 the old `closingTime` string took, which is the price of
   * the pill being able to say "Opens 5pm" instead of claiming a steakhouse is
   * open at breakfast. Rendered by OpenStatePill on every card.
   */
  hours: Hours;
  lat: number;
  lng: number;
  /**
   * Null means "not sourced yet" — never zero. `restaurants.listed` no
   * longer implies a rating: a restaurant can publish with a real menu and
   * no Yelp/Google match, and this carries that absence through instead of
   * laundering it into a fake number. Every renderer needs a story for the
   * null, the way `cuisine` above does — omit the rating/blend element
   * rather than showing "0", "N/A", or an empty star row.
   */
  rating: number | null;
  reviewCount: number | null;
  trending?: boolean;
  photo?: string;
  photoAlt?: string;
  /**
   * The photo's pixel size, so a card can reserve its box before the image
   * lands. Measured by `npm run photos:size`, never sourced — see the columns'
   * comment in scripts/migrate.mjs.
   *
   * Both undefined together or neither: a partial pair is not a ratio. Cheap
   * enough to carry into a client component at roughly ten bytes a row, against
   * the ~250 `hours` already costs.
   *
   * **Undefined is normal, not exceptional.** Twelve photos in the corpus never
   * resolved, and every newly imported restaurant is in this state until the
   * backfill next runs, so a caller that needs a height must have an answer for
   * the absence — `photoRatio` in lib/photoShape.ts is that answer.
   */
  photoW?: number;
  photoH?: number;
  priceBand: PriceBand | null;
};

export type NeighborhoodCenter = {
  name: string;
  lat: number;
  lng: number;
  // Rough estimate of how many restaurants that real neighborhood actually
  // has, from general knowledge of San Diego's dining scene — not pulled from
  // a live source, so treat these as ballpark relative figures, not counts.
  estimatedRestaurantCount: number;
};
