/**
 * The shape of what `/api/discover/suggest` returns, and nothing else.
 *
 * Split out of lib/suggest.ts because both sides of the wire need these types
 * and only one side may have the module that produces them: lib/suggest.ts
 * imports lib/db.ts, which holds the Neon client at module scope and is
 * server-only (CLAUDE.md). The dropdown components are `"use client"`. A
 * `import type` would erase, but the repo's convention here is a real
 * dependency-free module rather than a rule about which import keyword was
 * used — see the mirrored row types in src/app/friends/page.tsx.
 *
 * So: no imports in this file, ever. `SearchScope` in lib/textMatch.ts is the
 * four field readings below and is checked against these structurally.
 */

/**
 * The readings a line can be, in the order the menu prints them.
 *
 * The last four are fields, and are exactly `SearchScope` in lib/textMatch.ts —
 * they are what `?in=` takes and what `scopeOf` reads back off a relevance
 * score. `"all"` is not a field and never reaches `?in=`: it is the whole
 * matched set, every reading at once, ranked. It exists because Calvin asked
 * for it ("add an all tab that comes first") and because the default was
 * otherwise invisible — Enter already ran that search, but nothing on screen
 * said so or said how big it was.
 */
export type SuggestKind = "all" | "restaurant" | "cuisine" | "neighborhood" | "dish";

/**
 * One reading of what the visitor typed, and how much is behind it.
 *
 * This is a whole row of the dropdown, not a candidate for one. The menu offers
 * at most four lines — restaurants, cuisines, neighbourhoods, dishes — and each
 * says how many places picking it returns (Calvin: "one selection for dishes,
 * one selection for restaurants and one selection for food or whatever", and
 * before that "(cannonball dishes 2 results)").
 *
 * It replaced a list of individual names per group. The counts are the reason
 * the shape is worth the trouble: a menu of names has to guess which three of
 * four hundred to print, while a menu of readings answers the question the
 * visitor actually has — was that a place, a kind of food, or a dish — and
 * hands the rest to the grid.
 */
export type SuggestScope = {
  kind: SuggestKind;
  /**
   * What the line prints where the term goes.
   *
   * The corpus's own spelling when the reading names one thing — one restaurant,
   * one cuisine — and on the All line whenever it recommends (see `term`).
   * Otherwise the term as typed, because "cannonball" describes ten dish names
   * and any one of their labels would misrepresent the other nine.
   */
  label: string;
  /**
   * The text this line searches for — what goes in `?q=`.
   *
   * The term as typed on every scoped line, always: those lines search the
   * field for exactly what the visitor wrote (Calvin: they "are for when
   * people are searching for just a specific dish and it might be auto
   * correcting to something they dont want"). It parts from the typed term
   * only on the All line, which is the one line that recommends — completing
   * "tacos el" to "Tacos El Gordo", or correcting "breaksfast" to
   * "Breakfast" — and then `label` and `term` are both that wording, and
   * `count` is the size of the search it opens.
   */
  term: string;
  /** How many restaurants this line returns. The same unit on every line,
   *  because every line lands on a grid of restaurants. */
  count: number;
  /**
   * True when nothing in the corpus contains the visitor's spelling. Only the
   * All line can carry it — the scoped lines exist only for literal hits — and
   * the dropdown prints it as a "Did you mean" notice over the list rather
   * than mixing a guess in with answers (Calvin: "the dropdown menue should
   * include like spell chekced version to").
   */
  fuzzy: boolean;
  /**
   * Set when the reading names exactly one thing, and then it is that thing's
   * canonical value: a restaurant's id, a cuisine's label, a neighbourhood's.
   * Always null on the All line, even when it has completed the term to a
   * restaurant's name (Calvin: "tacos el" → Tacos El Gordo): that line puts
   * the name in `term` and runs the ranked search for it, so the place is
   * first on a grid the visitor can keep browsing, rather than opening its
   * page. `count` is the size of that search.
   *
   * It is what lets a line land somewhere better than a scoped search. One
   * restaurant goes to its own page — typing a name to go to a place is the
   * commonest thing this field is used for, and it was one click before this
   * dropdown existed. One cuisine goes to `?cuisine=Thai`, the URL the rail can
   * read back and show as a lit-up filter, rather than to a text search that
   * happens to return the same places.
   *
   * Null once a reading covers several things, and then the line falls back to
   * scoping the term (`?q=…&in=cuisine`) — which is the only honest URL for
   * "the two cuisines that look like this".
   */
  value: string | null;
  /**
   * The plate score and the blend, when the line names one restaurant — so a
   * line naming a place says how it rates like every other surface does
   * (lib/ratingDisplay.ts). Null everywhere else: a cuisine is not a place and
   * has no rating of its own.
   */
  percent: number | null;
  rating: number | null;
};

export type SuggestAnswer = {
  /** Echoed back so a response arriving out of order can be discarded. */
  query: string;
  /** All, then the readings with anything behind them, best first. Never more
   *  than five, and empty when nothing matched — including the All line, which
   *  has nothing to be all of. */
  scopes: SuggestScope[];
};

/**
 * One character is every restaurant in the city, which is not a suggestion.
 * Two is the floor because real names reach it — "Q'ero", "El Pollo" — and the
 * ladder's exact rungs still discriminate at that length.
 *
 * Enforced on the server, and checked again on the client so a one-letter
 * keystroke costs no request at all.
 */
export const MIN_SUGGEST_QUERY = 2;

/**
 * What each line calls its reading, in the singular — it is one line, and it
 * names a way of reading the term rather than a bucket of rows.
 */
export const SUGGEST_HEADING: Record<SuggestKind, string> = {
  all: "All",
  restaurant: "Restaurant",
  cuisine: "Cuisine",
  neighborhood: "Neighborhood",
  dish: "Dish",
};
