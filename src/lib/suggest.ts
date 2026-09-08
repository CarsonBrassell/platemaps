/**
 * What the search dropdown offers while someone is typing.
 *
 * Five lines at most: All, then one per *reading* of the term — a restaurant, a
 * cuisine, a neighbourhood, a dish. A typed word is genuinely ambiguous — "little italy"
 * is a neighbourhood, "birria taco" is a dish, "thai" is a cuisine, "kairoa" is
 * a restaurant — and the dropdown is where the visitor says which one they
 * meant. Picking a line commits to that reading and lands on Discover scoped to
 * it (`?q=…&in=dish`); picking nothing and pressing Enter falls through to the
 * ranked search in lib/textMatch.ts, where names beat cuisines beat dishes.
 * Both halves are Calvin's spec.
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
import { MAX_QUERY, relevanceFor } from "@/lib/discoverFilters";
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
 * How many restaurants each distinct cuisine and neighbourhood holds.
 *
 * Only *sizes*, and only for the two facet readings, because those are the two
 * lines that do not navigate to a scoped search: a line naming one cuisine goes
 * to `?cuisine=Thai`, and the number on it therefore has to be the size of the
 * facet rather than the size of the match. Everything else is counted by `scan`.
 *
 * Keyed on the corpus's own array so the entry is dropped when the 60s cache
 * is replaced — the same trick, and the same reason, as `SEARCH_FIELDS` in
 * lib/discoverFilters.ts.
 */
const VOCABULARY = new WeakMap<
  readonly RestaurantView[],
  Record<"cuisine" | "neighborhood", Map<string, number>>
>();

function vocabularyFor(restaurants: readonly RestaurantView[]) {
  let vocab = VOCABULARY.get(restaurants);
  if (vocab === undefined) {
    vocab = { cuisine: new Map<string, number>(), neighborhood: new Map<string, number>() };

    const bump = (into: Map<string, number>, label: string | null | undefined) => {
      const name = label?.trim();
      if (name) into.set(name, (into.get(name) ?? 0) + 1);
    };

    for (const r of restaurants) {
      bump(vocab.cuisine, r.cuisine);
      bump(vocab.neighborhood, r.neighborhood);
    }
    VOCABULARY.set(restaurants, vocab);
  }
  return vocab;
}

/* --- One pass, four readings --------------------------------------------- */

/**
 * A reading's two counts, because which one is printed is not decided until
 * every reading has been measured.
 *
 * `literal` counts only the rows whose text actually contains what was typed;
 * `all` includes the ones the similarity band reached. A correction is what you
 * offer when you found nothing, so the moment *any* reading has a literal hit,
 * a reading holding none of its own drops off the menu entirely. `literal`
 * decides that and nothing else — a line that survives always prints `all`,
 * which is the count its page holds; see the note at the emit site.
 *
 * That rule is not tidiness, it is what makes the menu readable. Typing
 * "landini" reaches three real Landini's by prefix, and unfiltered the same
 * dropdown also claimed a Cuisine reading (Indian) and a longer Restaurant one
 * (Rolando, Casa de Bandini) — all genuinely above the similarity floor, all
 * obviously wrong beside an exact prefix hit. The floors cannot fix that alone:
 * a floor asks "are these two strings alike", and the question here is "given
 * that the visitor has already been understood, is a guess worth printing".
 */
type Tally = { all: number; literal: number };

type Scan = {
  by: Record<SearchScope, Tally>;
  /**
   * Which cuisine and neighbourhood labels the matched rows carry. One label
   * under a reading means the line can become a facet
   * (`?cuisine=Thai`, which the rail reads back and lights up); two means it
   * cannot, and "Mexican" printed over a count that also includes Tex-Mex would
   * misname it.
   */
  labels: Record<"cuisine" | "neighborhood", Set<string>>;
  /** The best-scoring name match, for the line that holds exactly one place. */
  best: { r: RestaurantView; score: number } | null;
};

function emptyTally(): Tally {
  return { all: 0, literal: 0 };
}

/**
 * Score the corpus the way the grid scores it, and file the rows by field.
 *
 * `scoreRestaurant` tries name, then cuisine, then neighbourhood, then dish and
 * returns the *first* hit, so every matched row belongs to exactly one reading
 * and the four counts sum to the size of the unscoped result set. A restaurant
 * called Cannonball that also serves a cannonball roll is counted once, under
 * Restaurant — which is right, because that is the line it appears on and the
 * Dish line's page will not contain it.
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
    labels: { cuisine: new Set(), neighborhood: new Set() },
    best: null,
  };

  for (const r of restaurants) {
    const score = relevanceFor(r, query, dishes);
    const scope = scopeOf(score);
    if (scope === null) continue;

    const literal = isLiteralScore(score);
    const tally = found.by[scope];
    tally.all += 1;
    if (literal) tally.literal += 1;

    if (scope === "restaurant") {
      // Rating breaks ties beside the score rather than inside it, for the
      // reason spelled out in lib/restaurantRank.ts: added, a 4.8 crosses a
      // rung. A literal hit always outscores a fuzzy one, so the winner here is
      // also the winner of the literal-only count.
      const best = found.best;
      if (
        best === null ||
        score > best.score ||
        (score === best.score && (r.rating ?? 0) > (best.r.rating ?? 0))
      ) {
        found.best = { r, score };
      }
    } else if (scope === "cuisine" || scope === "neighborhood") {
      const label = (scope === "cuisine" ? r.cuisine : r.neighborhood)?.trim();
      if (label) found.labels[scope].add(label);
    }
  }

  return found;
}

/* --- The endpoint's answer ------------------------------------------------ */

export async function suggest(raw: string): Promise<SuggestAnswer> {
  const text = raw.trim().slice(0, MAX_QUERY);
  const query = prepare(text);
  if (query.text.length < MIN_SUGGEST_QUERY) return { query: text, scopes: NOTHING };

  const corpus = await loadCorpus();
  const asking = query.text.length >= DISH_MIN_QUERY;
  const found = scan(query, corpus.restaurants, asking ? await dishMatchesFor(text) : null);

  /* The whole matched set, taken here because nothing below has reshaped a
     reading yet. `?q=` with no `in=` is precisely the scan that just ran, so
     the All line's number is the sum of the four tallies — and deliberately not
     the sum of the numbers the four lines print, which are the sizes of four
     different pages: a cuisine line prints its facet's size, and a corrected
     dish line counts rows this spelling cannot reach at all. */
  const total = SEARCH_SCOPES.reduce((n, kind) => n + found.by[kind].all, 0);

  // Corrections everywhere, or nowhere — see the note above `Tally`.
  const anyLiteral = SEARCH_SCOPES.some((kind) => found.by[kind].literal > 0);

  /**
   * The one reading that gets a second look, and the only place a second round
   * trip is spent.
   *
   * Names, cuisines and neighbourhoods carry their own similarity pass through
   * `scoreRestaurant`, so a misspelling of one is already in `found`. Dish text
   * is not in the corpus at all — it arrives as an `ILIKE` from Postgres, which
   * either contains the typed spelling or does not — so the only way to offer
   * "did you mean" for a dish is to ask `dish_names` for the nearest wording and
   * score the corpus again with it.
   *
   * Both guards matter. Zero dish rows means the spelling reaches no menu, so a
   * correction is the only dish answer left; no literal hit anywhere means
   * nothing else has understood the visitor yet, and a guess printed beside a
   * real hit is noise. Skipping it there saves two round trips on the commonest
   * search there is — a restaurant's name, which is on nobody's menu.
   *
   * The rescore uses the corrected term as the *query*, not just as the dish
   * map, because that is exactly what the grid will do when the line is picked:
   * `?q=<nearest>&in=dish`.
   */
  let dishTerm: string | null = null;
  if (asking && !anyLiteral && found.by.dish.all === 0) {
    const nearest = await nearestDishName(query.text);
    if (nearest !== null) {
      const corrected = scan(
        prepare(nearest),
        corpus.restaurants,
        await dishMatchesFor(nearest),
      );
      if (corrected.by.dish.all > 0) {
        // `literal` stays zero: nothing is spelled the way the visitor spelled
        // it, which is exactly what makes this line a correction.
        found.by.dish = { all: corrected.by.dish.all, literal: 0 };
        dishTerm = nearest;
      }
    }
  }

  const vocab = vocabularyFor(corpus.restaurants);

  const scopes = SEARCH_SCOPES.flatMap((kind): SuggestScope[] => {
    const tally = found.by[kind];

    /* Two different questions, once answered with one number.
       *Whether* the line appears is the readability rule above: with a literal
       hit somewhere, a reading reached only by correcting spelling is a guess
       beside an answer, and drops off. `shown` is that test, and it is also
       what "this reading is a single thing" means — one literal hit beside a
       fuzzy tail is still one restaurant.

       What the line *prints* is a promise about the next screen, so it is the
       size of the page it opens, decided per branch below. For a scoped search
       that is `all`, because `?in=` knows nothing about corrections and keeps
       every row that matched on the field, fuzzy tail included. Printing
       `literal` there is what put "140 results" over a page of 150. */
    const shown = anyLiteral ? tally.literal : tally.all;
    if (shown === 0) return [];

    const fuzzy = !anyLiteral;
    const line = {
      kind,
      label: text,
      term: text,
      count: tally.all,
      fuzzy,
      value: null,
      percent: null,
      rating: null,
    };

    if (kind === "restaurant") {
      /* One reading, one restaurant: the line becomes that place, goes to its
         own page, and counts 1 — which is the page it opens, not the size of a
         search nobody is about to run. "cannonbal" is the case, and Calvin's
         own example of the shape: Cannonball is the answer, while Smoking
         Cannon Brewery is the similarity band's opinion about the same nine
         letters and does not belong on a line that says "Cannonball".

         Otherwise the line is called by what was typed, and this is the half
         that is easy to get wrong: 253 places score against "sushhi", and
         labelling that line with the best of them ("Arbor Sushi & Grill
         Express") promises a page it does not go to. */
      const one = shown === 1 ? (found.best?.r ?? null) : null;
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

    if (kind === "dish") {
      /* `dishTerm` is set only on a correction, and it is both what is printed
         and what is searched for — echoing "sushhi" back under a "Did you mean"
         is not an answer. Dishes never carry a `value`: `?dish=` is an equality
         on menu wording, which is a narrower question than the count measured. */
      return [{ ...line, label: dishTerm ?? text, term: dishTerm ?? text }];
    }

    /* A facet line reports the size of the facet, not the size of the match,
       because `?cuisine=Thai` is where it goes — and that page holds every Thai
       place whether or not its name also scored. With two labels under the
       reading there is no facet to name, so the line stays a scoped search and
       keeps the count `scan` measured. Two labels means two the *grid* would
       hold, corrections included, for the same reason the count is `all`. */
    const matched = found.labels[kind];
    const only = matched.size === 1 ? [...matched][0] : null;

    return [
      {
        ...line,
        label: only ?? text,
        count: only ? (vocab[kind].get(only) ?? tally.all) : tally.all,
        value: only,
      },
    ];
  });

  /* Calvin: "add an all tab that comes first."
   *
   * It is the search Enter was already running, given a line of its own. That
   * default was invisible before: the menu showed four narrowings and nothing
   * for the un-narrowed answer, so the one reading that never guesses wrong —
   * everything, ranked, names before cuisines before dishes — was the only one
   * with no number beside it.
   *
   * First rather than last because it is the fallback, and a fallback offered
   * after four alternatives reads as a fifth alternative. It is also the only
   * line that cannot be the wrong choice, which is what a default is.
   *
   * Suppressed when nothing matched at all — an All line over an empty grid is
   * the failure Calvin reported, printed in advance. */
  if (total > 0) {
    scopes.unshift({
      kind: "all",
      label: text,
      term: text,
      count: total,
      fuzzy: !anyLiteral,
      value: null,
      percent: null,
      rating: null,
    });
  }

  return { query: text, scopes };
}
