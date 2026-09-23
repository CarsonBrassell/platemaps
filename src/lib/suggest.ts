/**
 * What the search dropdown offers while someone is typing.
 *
 * Five lines at most: All, then one per *reading* of the term — a restaurant, a
 * cuisine, a neighbourhood, a dish. A typed word is genuinely ambiguous — "little italy"
 * is a neighbourhood, "birria taco" is a dish, "thai" is a cuisine, "kairoa" is
 * a restaurant — and the dropdown is where the visitor says which one they
 * meant. Picking a line commits to that reading and lands on Discover scoped to
 * it (`?q=…&in=dish`); picking nothing and pressing Enter falls through to the
 * ranked search in lib/textMatch.ts, where a literal cuisine match beats a
 * soft name match beats a dish match (Calvin, 2026-09-13). Both halves are
 * Calvin's spec.
 *
 * Each line carries how many restaurants it returns, which is the shape Calvin
 * asked for twice — "(cannonball dishes 2 results)", then "one selection for
 * dishes, one selection for restaurants and one selection for food or
 * whatever". It replaced a list of individual names per group, and the counts
 * are why the swap is worth it: a menu of names has to guess which three of
 * four hundred to print, while a menu of readings answers the question the
 * visitor actually has and hands the rest to the grid.
 *
 * ## Where the counts come from
 *
 * From the grid's own scorer, over the grid's own rows. `scan` below walks the
 * 60s corpus cache `lib/discover.ts` keeps and calls `relevanceFor` — the same
 * function `matchesFilters` calls — then files each row under `scopeOf`, which
 * is the same thing `?in=` filters on. So the four counts are a partition of
 * one ranked result set, and the number on a line is by construction the number
 * of places the line navigates to.
 *
 * That is worth spelling out because the obvious implementation is wrong, and
 * was what shipped first: counting each reading with its own pass (names here,
 * the cuisine vocabulary there) double-counts a restaurant that matches on two
 * fields, and drifts from the grid wherever the two passes disagree about the
 * fuzzy band. The Restaurant line offered 140 for "thai" and its own page then
 * rendered 150. One pass cannot disagree with itself.
 *
 * Dishes are the exception that proves it: the corpus deliberately holds no
 * dishes, so the scorer needs `dishMatchesFor` handed to it, exactly as
 * `getDiscoverPage` hands it over. That one round trip is this module's only
 * cost beyond the cache.
 *
 * This runs on the server. `/api/discover/suggest` is the only caller.
 */

import type { MatchedDish, RestaurantView } from "@/data/restaurantTypes";
import { dishMatchesFor, nearestDishName } from "@/lib/db";
import { loadCorpus } from "@/lib/discover";
import {
  corpusHasLiteralCategory,
  MAX_QUERY,
  relevanceFor,
  withCategoryDemotion,
} from "@/lib/discoverFilters";
import {
  MIN_SUGGEST_QUERY,
  type SuggestAnswer,
  type SuggestKind,
  type SuggestScope,
} from "@/lib/suggestTypes";
import {
  isLiteralScore,
  prepare,
  scopeOf,
  SEARCH_SCOPES,
  similarity,
  TIER,
  VOCABULARY_ENOUGH,
  type Prepared,
  type SearchScope,
} from "@/lib/textMatch";

/* The wire shapes live in lib/suggestTypes.ts, which imports nothing, so the
   client components can have them without pulling lib/db.ts into the browser
   bundle. Re-exported here because this is the module the answer comes from. */
export type { SuggestAnswer, SuggestKind, SuggestScope };

/**
 * Dishes need a third character before they are asked for at all. `dish_names`
 * is reached through a trigram index, and under three characters there is no
 * trigram to look up — the query degrades to a scan of 187,183 rows to return
 * something like "tea", which is not worth a keystroke's latency.
 */
const DISH_MIN_QUERY = 3;

const NOTHING: SuggestAnswer["scopes"] = [];

/* --- The controlled vocabularies ----------------------------------------- */

/**
 * How many restaurants each distinct cuisine and neighbourhood holds, and
 * every category word the corpus can be searched by.
 *
 * The *sizes* are for the two facet readings, because those are the two lines
 * that do not navigate to a scoped search: a line naming one cuisine goes to
 * `?cuisine=Thai`, and the number on it therefore has to be the size of the
 * facet rather than the size of the match. Everything else is counted by
 * `scan`.
 *
 * The *words* are for the All line's correction of a misspelled category.
 * `scoreCuisine` in lib/textMatch.ts reaches a row through its cuisine label
 * or through its search tags, and the tags are where the words people
 * actually type live — "breaksfast" reaches a coffee shop through the tag
 * "Breakfast", while the shop's cuisine label is "Bakery & Desserts". The
 * label the matched rows carry is therefore the wrong thing to offer; the
 * word that matched is the right one, and this is the list it is looked up
 * in: each cuisine label whole, and each word of each tag string (the tags
 * are stored space-joined, so a two-word tag is two entries — a limit
 * accepted, since no misspelling of "fast food" is going to be nearer to
 * "food" than to a real cuisine).
 *
 * Keyed on the corpus's own array so the entry is dropped when the 60s cache
 * is replaced — the same trick, and the same reason, as `SEARCH_FIELDS` in
 * lib/discoverFilters.ts.
 */
type Vocabulary = Record<"cuisine" | "neighborhood", Map<string, number>> & {
  words: { shown: string; word: Prepared; label: boolean }[];
};

const VOCABULARY = new WeakMap<readonly RestaurantView[], Vocabulary>();

function vocabularyFor(restaurants: readonly RestaurantView[]): Vocabulary {
  let vocab = VOCABULARY.get(restaurants);
  if (vocab === undefined) {
    vocab = {
      cuisine: new Map<string, number>(),
      neighborhood: new Map<string, number>(),
      words: [],
    };

    const bump = (into: Map<string, number>, label: string | null | undefined) => {
      const name = label?.trim();
      if (name) into.set(name, (into.get(name) ?? 0) + 1);
    };

    const seen = new Set<string>();
    const word = (shown: string, label: boolean) => {
      const prepared = prepare(shown);
      if (!prepared.text || seen.has(prepared.text)) return;
      seen.add(prepared.text);
      vocab!.words.push({ shown, word: prepared, label });
    };

    for (const r of restaurants) {
      bump(vocab.cuisine, r.cuisine);
      bump(vocab.neighborhood, r.neighborhood);
    }
    // Labels before tags, so a word that is both — "Mexican" — is kept as
    // the label, with the label's casing and the label's tie-break.
    for (const label of vocab.cuisine.keys()) word(label, true);
    for (const r of restaurants) {
      for (const tag of (r.cuisineTags ?? "").split(/\s+/)) {
        if (tag) word(tag[0].toUpperCase() + tag.slice(1), false);
      }
    }
    VOCABULARY.set(restaurants, vocab);
  }
  return vocab;
}

/**
 * The category word nearest to what was typed, or null when none is near.
 *
 * The same floor and the same short-query guard `scoreVocabulary` applies —
 * below five letters bigram similarity is noise ("cod" reaches "Co."), and
 * under 0.5 nothing in a 29-cuisine vocabulary is a plausible reading. A
 * cuisine label beats a tag word on a tie, because it is the wording the
 * filter rail speaks.
 */
function nearestCategory(query: Prepared, vocab: Vocabulary): string | null {
  if (query.text.length <= 4) return null;
  let pick: { shown: string; close: number; label: boolean } | null = null;
  for (const { shown, word, label } of vocab.words) {
    const close = similarity(query, word);
    if (close < VOCABULARY_ENOUGH) continue;
    if (pick === null || close > pick.close || (close === pick.close && label && !pick.label)) {
      pick = { shown, close, label };
    }
  }
  return pick?.shown ?? null;
}

/* --- One pass, four readings --------------------------------------------- */

/**
 * A reading's two counts, because which one is printed is not decided until
 * every reading has been measured.
 *
 * `literal` counts only the rows whose text actually contains what was typed;
 * `all` includes the ones the similarity band reached. A scoped line exists
 * only when its `literal` is above zero, and a line that exists prints `all`,
 * which is the count its page holds; see the note at the emit site. Whether
 * *any* reading has a literal hit is what decides if the All line completes
 * (something was understood) or corrects (nothing was).
 *
 * The literal-only rule is not tidiness, it is what makes the menu readable.
 * Typing "landini" reaches three real Landini's by prefix, and unfiltered the
 * same dropdown also claimed a Cuisine reading (Indian) and a longer
 * Restaurant one (Rolando, Casa de Bandini) — all genuinely above the
 * similarity floor, all obviously wrong beside an exact prefix hit. The floors
 * cannot fix that alone: a floor asks "are these two strings alike", and the
 * question here is "is a guess worth printing on a line that promises a
 * specific field" — and Calvin's answer is no, guesses belong on All.
 */
type Tally = { all: number; literal: number };

type Scan = {
  by: Record<SearchScope, Tally>;
  /**
   * Which cuisine and neighbourhood labels the matched rows carry, and how
   * many rows carry each. One label under a reading means the line can become
   * a facet (`?cuisine=Thai`, which the rail reads back and lights up); two
   * means it cannot, and "Mexican" printed over a count that also includes
   * Tex-Mex would misname it. The counts are for the All line's neighbourhood
   * correction: the label most of the reached rows carry is the one to offer.
   */
  labels: Record<"cuisine" | "neighborhood", Map<string, number>>;
  /** The best-scoring name match, for the line that holds exactly one place. */
  best: { r: RestaurantView; score: number } | null;
};

function emptyTally(): Tally {
  return { all: 0, literal: 0 };
}

/**
 * Whether `a` is the better answer to "which one did you mean" than `b`, when
 * both scored the same: more reviews, then a higher rating. Nulls count as
 * zero — a row with no sourced numbers is the least likely thing anyone typed.
 */
function morePopular(a: RestaurantView, b: RestaurantView): boolean {
  const reviews = (a.reviewCount ?? 0) - (b.reviewCount ?? 0);
  if (reviews !== 0) return reviews > 0;
  return (a.rating ?? 0) > (b.rating ?? 0);
}

/**
 * Score the corpus the way the grid scores it, and file the rows by field.
 *
 * `scoreRestaurant` scores name and cuisine and keeps the higher of the two —
 * the ladder interleaves them, so neither can be tried first — then falls back
 * to neighbourhood, then dish, only when both are 0. Either way it returns one
 * number, `scopeOf` reads back exactly one field from it, so every matched row
 * belongs to exactly one reading and the four counts sum to the size of the
 * unscoped result set. A restaurant called Cannonball that also serves a
 * cannonball roll is counted once, under Restaurant — which is right, because
 * that is the line it appears on and the Dish line's page will not contain it.
 */
function scan(
  query: Prepared,
  restaurants: readonly RestaurantView[],
  dishes: Map<string, MatchedDish> | null,
): Scan {
  const found: Scan = {
    by: {
      restaurant: emptyTally(),
      cuisine: emptyTally(),
      neighborhood: emptyTally(),
      dish: emptyTally(),
    },
    labels: { cuisine: new Map(), neighborhood: new Map() },
    best: null,
  };

  // Same "literal-name trap" demotion the grid applies in `scoreMatches` —
  // otherwise the dropdown would send a visitor typing "tacos" straight to
  // an unrated restaurant literally called "Tacos" via `value` (single
  // restaurant match, one click to its page) while the grid it lands on next
  // ranks that restaurant correctly. See the comment on `withCategoryDemotion`
  // in lib/discoverFilters.ts.
  const categoryWord = corpusHasLiteralCategory(restaurants, query);

  for (const r of restaurants) {
    const score = withCategoryDemotion(relevanceFor(r, query, dishes), categoryWord);
    const scope = scopeOf(score);
    if (scope === null) continue;

    const literal = isLiteralScore(score);
    const tally = found.by[scope];
    tally.all += 1;
    if (literal) tally.literal += 1;

    if (scope === "restaurant") {
      // Ties on the score are broken beside it rather than inside it, for the
      // reason spelled out in lib/restaurantRank.ts: added, a 4.8 crosses a
      // rung. A literal hit always outscores a fuzzy one, so the winner here is
      // also the winner of the literal-only count.
      //
      // Review count first, then rating. This is the row the All line
      // completes the term to, so the tie asks "which of these did the
      // visitor mean", and the answer is the one everybody has been to:
      // against "tacos el", Tacos El Gordo (4.4, ~19,000 reviews) and Tacos
      // "El Moy" (5.0, seven reviews) are both prefix hits, and rating-first
      // completed to El Moy.
      const best = found.best;
      if (
        best === null ||
        score > best.score ||
        (score === best.score && morePopular(r, best.r))
      ) {
        found.best = { r, score };
      }
    } else if (scope === "cuisine" || scope === "neighborhood") {
      const label = (scope === "cuisine" ? r.cuisine : r.neighborhood)?.trim();
      if (label) found.labels[scope].set(label, (found.labels[scope].get(label) ?? 0) + 1);
    }
  }

  return found;
}

/**
 * Whether the Cuisines line should print above Restaurants, on this one term.
 *
 * `SEARCH_SCOPES` iterates restaurant before cuisine (see its own comment in
 * lib/textMatch.ts) and `suggest` below builds `scopes` in that fixed order,
 * but the dropdown's ordering is a different question from the ranked
 * ladder's tiering: a visitor who typed a category word wants the category,
 * even if some restaurant's name also happens to contain the same letters,
 * regardless of how any one term's name-score and cuisine-score compare on
 * the ladder. Calvin, after "breaksfast" landed on a restaurant ten miles
 * away instead of the Breakfast category: a misspelled category word means
 * the category.
 *
 * Three calls, in order:
 *  1. The term hits a cuisine or search tag *literally* (exact, prefix or
 *     substring — the literal rungs `explainTerm` in lib/textMatch.ts scores,
 *     which `scoreCuisine` climbs the same way for this exact vocabulary) —
 *     Cuisines first, unconditionally. This is the "breaksfast" shape once the
 *     spelling is fixed to "breakfast": a literal category beats any name.
 *  2. Failing that, the term reaches a cuisine only through the similarity
 *     pass, *and* it names one restaurant exactly, whole word for word —
 *     Restaurants first. A perfect name match is not a guess the way a
 *     corrected category word is.
 *  3. Failing that, both readings are guesses (fuzzy cuisine, fuzzy or no
 *     exact-name restaurant) — Cuisines first, Calvin's call: between two
 *     corrections, the category is the more useful one to land on.
 *  4. Otherwise, today's order stands: Restaurants first.
 *
 * Reads `found` rather than re-deriving anything, so this never disagrees with
 * whether the two lines are shown at all or what `fuzzy` says about them —
 * `suggest` below computes both from the same tallies.
 */
function cuisineBeforeRestaurant(found: Scan): boolean {
  const cuisineLiteral = found.by.cuisine.literal > 0;
  if (cuisineLiteral) return true;

  const cuisineFuzzy = found.by.cuisine.all > 0; // literal is false here, so this is fuzzy-only
  if (!cuisineFuzzy) return false;

  const restaurantExactName = found.best !== null && found.best.score === TIER.NAME_EXACT;
  if (restaurantExactName) return false;

  const restaurantFuzzy = found.by.restaurant.all > 0 && found.by.restaurant.literal === 0;
  return restaurantFuzzy;
}

/* --- The endpoint's answer ------------------------------------------------ */

export async function suggest(raw: string): Promise<SuggestAnswer> {
  const text = raw.trim().slice(0, MAX_QUERY);
  const query = prepare(text);
  if (query.text.length < MIN_SUGGEST_QUERY) return { query: text, scopes: NOTHING };

  const corpus = await loadCorpus();
  const asking = query.text.length >= DISH_MIN_QUERY;
  const found = scan(query, corpus.restaurants, asking ? await dishMatchesFor(text) : null);

  /* The whole matched set. `?q=` with no `in=` is precisely the scan that just
     ran, so an All line that stands on the typed term prints the sum of the
     four tallies — and deliberately not the sum of the numbers the four lines
     print, which are the sizes of four different pages: a cuisine line prints
     its facet's size, a single-restaurant line prints 1. */
  const total = SEARCH_SCOPES.reduce((n, kind) => n + found.by[kind].all, 0);

  // Understood, or not — see the note above `Tally`.
  const anyLiteral = SEARCH_SCOPES.some((kind) => found.by[kind].literal > 0);

  /**
   * The size of the ranked search for `term` — what `?q=<term>&in=all` opens.
   *
   * A second `scan`, with its own dish lookup, because the All line prints the
   * count of the page it opens and that page is not the typed term's when the
   * term has been completed or corrected: a dish literally called "Cannonball"
   * is on the grid `?q=Cannonball` opens, and the dish map for "cannonbal"
   * cannot stand in for it. One more ILIKE, spent knowingly: the answer is
   * cached at the edge for a minute, and a wrong count is what the dropdown
   * exists to avoid — the first cut printed "101 results" over a line that
   * opened one page, and Calvin asked why.
   */
  async function sizeOf(term: string): Promise<number> {
    const named = scan(prepare(term), corpus.restaurants, await dishMatchesFor(term));
    return SEARCH_SCOPES.reduce((n, kind) => n + named.by[kind].all, 0);
  }

  const vocab = vocabularyFor(corpus.restaurants);

  /* The four scoped lines: Restaurant, Cuisine, Neighborhood, Dish.
   *
   * Literal only. A line appears when something in its field actually
   * contains what was typed, and it searches for what was typed — never for a
   * correction, never for a completion. Calvin: "if there is a recommended
   * search result it should show up in all, not under restaurants dish,
   * cuisine cus those are for when people are searching for just a specific
   * dish and it might be auto correcting to something they dont want." So the
   * spell-checked lines these used to become when nothing matched literally
   * are gone, and the one correction that lived on a scoped line — a
   * misspelled dish rewritten to the nearest dish name — moved to the All line
   * with the rest of the guessing.
   *
   * What a line *prints* is still the size of the page it opens, and for a
   * scoped search that is `all`, not `literal`: `?in=` knows nothing about
   * corrections and keeps every row that matched on the field, fuzzy tail
   * included. Printing `literal` is what put "140 results" over a page of
   * 150. `literal` decides only whether the line exists. */
  const scopes = SEARCH_SCOPES.flatMap((kind): SuggestScope[] => {
    const tally = found.by[kind];
    if (tally.literal === 0) return [];

    const line = {
      kind,
      label: text,
      term: text,
      count: tally.all,
      fuzzy: false,
      value: null,
      percent: null,
      rating: null,
    };

    if (kind === "restaurant") {
      /* One literal hit, one restaurant: the line becomes that place, goes to
         its own page, and counts 1 — which is the page it opens, not the size
         of a search nobody is about to run. That is not a correction: the
         visitor typed this place's name, or enough of it that no other sign
         contains it. A literal hit always outscores a fuzzy one, so
         `found.best` is the literal one.

         Otherwise the line is called by what was typed, and this is the half
         that is easy to get wrong: 36 places have Pizza on their sign, and
         labelling that line with the best of them promises a page it does not
         go to. */
      const one = tally.literal === 1 ? (found.best?.r ?? null) : null;
      if (one === null) return [line];

      return [
        {
          ...line,
          count: 1,
          label: one.name,
          value: one.id,
          percent: corpus.plates[one.id]?.percent ?? null,
          rating: one.rating ?? null,
        },
      ];
    }

    /* Dishes never carry a `value`: `?dish=` is an equality on menu wording,
       which is a narrower question than the count measured. */
    if (kind === "dish") return [line];

    /* A facet line reports the size of the facet, not the size of the match,
       because `?cuisine=Thai` is where it goes — and that page holds every Thai
       place whether or not its name also scored. With two labels under the
       reading there is no facet to name, so the line stays a scoped search and
       keeps the count `scan` measured. Two labels means two the *grid* would
       hold, corrections included, for the same reason the count is `all`. */
    const matched = found.labels[kind];
    const only = matched.size === 1 ? [...matched.keys()][0] : null;

    return [
      {
        ...line,
        label: only ?? text,
        count: only ? (vocab[kind].get(only) ?? tally.all) : tally.all,
        value: only,
      },
    ];
  });

  /* Restaurants leads Cuisines by default (`SEARCH_SCOPES`'s own iteration
     order), except the calls `cuisineBeforeRestaurant` documents — swapped
     here rather than in `SEARCH_SCOPES.flatMap` above so that loop stays one
     thing (what each line says) and this stays another (what order the lines
     print in). Both readings are 0-or-1 entries, so a swap is the whole
     reorder; a kind missing from `scopes` (nothing to show) leaves `indexOf`
     at -1 and this is a no-op. */
  const restaurantAt = scopes.findIndex((s) => s.kind === "restaurant");
  const cuisineAt = scopes.findIndex((s) => s.kind === "cuisine");
  if (restaurantAt !== -1 && cuisineAt !== -1 && cuisineBeforeRestaurant(found)) {
    [scopes[restaurantAt], scopes[cuisineAt]] = [scopes[cuisineAt], scopes[restaurantAt]];
  }

  /* Calvin: "add an all tab that comes first."
   *
   * It is the search Enter was already running, given a line of its own. That
   * default was invisible before: the menu showed four narrowings and nothing
   * for the un-narrowed answer, so the one reading that never guesses wrong —
   * everything, ranked, names before cuisines before dishes — was the only one
   * with no number beside it.
   *
   * First rather than last because it is the fallback, and a fallback offered
   * after four alternatives reads as a fifth alternative.
   *
   * Calvin, later: "this all option should auto jump to the thing the most
   * obvious, for example if im typing tacos el it should just jump to tacos
   * el gordo" — then, once it opened the restaurant's page: "it shouldnt take
   * you directly to the sight it should just auto fil tacos el gordo and tehn
   * you can browse from there" — and then: "if there is a recommended search
   * result it should show up in all, not under restaurants dish, cuisine".
   *
   * So this is the one line that recommends. It completes or corrects the
   * term to the corpus's own wording, prints that, puts it in the field when
   * picked, and runs the ranked search *for it* — where the recommended thing
   * is first on the grid and the rest of the grid is there to browse. It is
   * an autocomplete, not a shortcut to one page: `value` stays null and the
   * line never carries a rating, because it opens a grid and not a place.
   * `count` is the size of that search (`sizeOf`), not of the typed term's.
   *
   * Two shapes, told apart by `anyLiteral`:
   *
   *  - Something contains what was typed. The recommendation is a completion,
   *    and only of a restaurant's sign: the ranked search's own first row
   *    (`found.best`, scored the way the grid scores and tie-broken by review
   *    count then rating), when it is a literal hit and the term is not a
   *    category — a cuisine, by `cuisineBeforeRestaurant`, the same call that
   *    puts Cuisines above Restaurants in the menu, or a neighbourhood some
   *    sign literally contains, unless the sign was typed whole. Rewriting
   *    "pizza" into the name of the most-reviewed place with Pizza on its
   *    sign is the literal-name trap this dropdown exists to avoid, and
   *    rewriting "little italy" into Little Italy Ristorante Pizzeria is the
   *    same trap through the other facet; both stay as typed. A literal
   *    cuisine, neighbourhood or dish is not completed either: the typed word
   *    already is the wording, and the scoped lines below say so.
   *
   *  - Nothing does. Every scoped line has dropped, and this line alone
   *    carries the "Did you mean" (`fuzzy: true`, which the menu prints as a
   *    notice over the list). The correction is chosen in the order
   *    `cuisineBeforeRestaurant` ranks two guesses — a category before a
   *    sign, because between two corrections the category is the more useful
   *    one to land on: the nearest category word (`nearestCategory`, so
   *    "breaksfast" means Breakfast, the tag it reached, and not the cuisine
   *    label of the coffee shops that carry it), then the neighbourhood most
   *    of the reached rows are in, then the nearest restaurant's sign, then
   *    the nearest dish name — asked of `dish_names` only here, because dish
   *    text is not in the corpus and a similarity pass over it is a second
   *    round trip that a name search should never pay. With no guess at all
   *    the term stands as typed over whatever the similarity band reached.
   *
   * Suppressed when the search it would open is empty — an All line over an
   * empty grid is the failure Calvin reported, printed in advance. */
  let recommended: string | null = null;
  if (anyLiteral) {
    const best = found.best;
    const wholeSign = best !== null && best.score === TIER.NAME_EXACT;
    const category =
      cuisineBeforeRestaurant(found) || (found.by.neighborhood.literal > 0 && !wholeSign);
    if (best !== null && isLiteralScore(best.score) && !category) recommended = best.r.name;
  } else {
    recommended =
      (found.by.cuisine.all > 0 ? nearestCategory(query, vocab) : null) ??
      commonest(found.labels.neighborhood, vocab.neighborhood) ??
      found.best?.r.name ??
      (asking ? await nearestDishName(query.text) : null);
  }

  let term = text;
  let count = total;
  if (recommended !== null) {
    const size = await sizeOf(recommended);
    // A recommendation the grid cannot find is no recommendation; the typed
    // term over whatever the similarity band reached is the honest fallback.
    if (size > 0) {
      term = recommended;
      count = size;
    }
  }
  if (count > 0) {
    scopes.unshift({
      kind: "all",
      label: term,
      term,
      count,
      fuzzy: !anyLiteral,
      value: null,
      percent: null,
      rating: null,
    });
  }

  return { query: text, scopes };
}

/**
 * The label most of a reading's matched rows carry — ties broken by the size
 * of the facet — or null when the reading reached none. Matched rows first,
 * because they are what the visitor's spelling reached. Used for
 * neighbourhoods, where the label *is* the word that matched; cuisines go
 * through `nearestCategory` instead, because there the word that matched is
 * usually a tag and not the label.
 */
function commonest(labels: Map<string, number>, sizes: Map<string, number>): string | null {
  let pick: string | null = null;
  for (const [label, matched] of labels) {
    if (pick === null) {
      pick = label;
      continue;
    }
    const lead = matched - (labels.get(pick) ?? 0);
    if (lead > 0 || (lead === 0 && (sizes.get(label) ?? 0) > (sizes.get(pick) ?? 0))) pick = label;
  }
  return pick;
}
