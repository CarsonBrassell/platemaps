/**
 * Fuzzy text matching and the relevance ladder, shared by every search surface.
 *
 * ## Why this exists
 *
 * Discover's grid matched a query with one `String.includes` over a string that
 * had `name`, `cuisine`, `cuisine_tags` and `neighborhood` concatenated into
 * it. That has three failures, and a visitor hits all three in a single search:
 *
 * 1. **One wrong letter returns nothing.** There is no recovery from a typo in
 *    a substring test — it either matches or it does not.
 * 2. **Words must be contiguous and in the stored order.** The corpus name is
 *    whatever the importer wrote, so `Kairoa Brewing` does not answer "Kairoa
 *    Brewing Company", and `Sunny Side Solana` does not answer "Solana Sunny
 *    Side".
 * 3. **Nothing knows which field matched.** Once the four fields are one
 *    string, "rank names above cuisines above dishes" cannot be expressed.
 *
 * What was left standing when a name failed was the dish half of the query —
 * an unranked `ILIKE '%term%'` over 385,165 rows — so a misspelled restaurant
 * name returned a wall of unrelated menus. That is the reported bug.
 *
 * ## The ladder
 *
 * `restaurantRank.ts` already had the right ordering — name over cuisine over
 * dish — for the header dropdown. This module generalises it, adds the two
 * things it lacked (out-of-order tokens, and fuzzy), and becomes the one copy
 * that Discover's grid, the dropdowns and the suggest endpoint all read, so a
 * term that reaches a place on one surface reaches it on the others.
 *
 * ## The one invariant
 *
 * **Tiebreakers never cross a tier.** Bands are 100 apart and the tie value
 * (distance, rating, plate score) is applied by the *caller*, within a band,
 * never added to the tier score. `restaurantRank.ts` used to add `rating`
 * straight onto a ladder whose rungs were 2-5 points apart, so a 4.8-star dish
 * match (48 + 4.8) outranked a cuisine match (50) — the exact mis-ordering this
 * module exists to stop. The gap between the *worst* name match (500) and the
 * *best* dish match (220) is 280 points, and nothing may close it.
 *
 * ## Name versus cuisine (Calvin, 2026-09-13, reversing 2026-09-07)
 *
 * The ladder used to put every name rung above every cuisine rung, on the
 * theory that a name match answers "the place I typed" better than a category
 * ever could. That put "Breakfast Republic" — a name-prefix hit ten miles
 * away — above the Breakfast & Brunch places next door for a search of
 * "breakfast", which is backwards: a category word means "the nearest places
 * of this kind," not "the nearest place whose sign starts with this word." A
 * literal cuisine match now outranks everything except a literal or
 * whole-name match — see the TIER table below for exactly where.
 *
 * Pure on purpose: imported by server code and by client components alike. Its
 * one import, `foldAccents`, is the same kind of thing — a string function with
 * no dependencies of its own — and it is shared rather than copied so the
 * search fold and the branch grouping in `brandName.ts` can never disagree
 * about whether `Poké Chop` and `Poke Chop` are the same words.
 */

import { foldAccents } from "@/lib/brandName";

/* --- Normalisation -------------------------------------------------------- */

/**
 * Query and haystack are folded the same way or the comparison is meaningless.
 *
 * Stricter than the `foldSearchText` it replaces, which only dropped
 * apostrophes. Every other non-alphanumeric becomes a space, so hyphens,
 * commas and slashes stop being the difference between a hit and nothing; `&`
 * becomes "and" first, because a visitor types the word about as often as the
 * symbol and the corpus is inconsistent about which it stored.
 *
 * Apostrophes are *removed* rather than spaced, which is the one asymmetry and
 * it is deliberate: 90 listed names carry a curly apostrophe and 1,100 a
 * straight one, and "Clem's" has to fold to "clems", not "clem s".
 *
 * **Accents are folded to their base letter, and that has to happen before the
 * alphanumeric pass.** This comment used to claim accents were already handled
 * and they were not: `é` is not in `a-z`, so it was becoming a *space* and
 * "Poké Chop" normalised to "pok chop". 220 listed names fold differently once
 * the marks come off, and the visible cost was a reader searching "poke chop"
 * being shown the two branches spelled without the accent — Encinitas and
 * Pacific Beach — while the two nearest them, Hillcrest and Talmadge, did not
 * exist as far as the search was concerned. `foldAccents` splits the character
 * apart first so the `e` survives into the fold.
 */
export function normalize(value: string): string {
  return (
    foldAccents(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’`´]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      /* A possessive apostrophe dropped as a space ("pauly s", "roberto s
         tacos") rather than deleted outright ("paulys") is the other way
         people spell a name they can't be bothered to reach for the ' key —
         and the line above only handles the second way, because by the time
         it runs the apostrophe is already gone and there is nothing left
         to turn into a space. Re-fusing a stray single-letter "s" onto the
         word before it makes both spellings normalize the same, which is
         what lets "pauly s" reach a name stored (after the same fold) as
         "paulys pizza joint" at all — every exact/prefix/substring rung
         above the fuzzy one is a `.text` comparison, and none of them see
         past a real, typed space. A bare "s" is not an English word on its
         own, so there is nothing legitimate this costs. */
      .replace(/([a-z0-9]) s(?= |$)/g, "$1s")
  );
}

/** The words of a normalised string. Empty for a string with none. */
export function tokenize(value: string): string[] {
  return value ? value.split(" ") : [];
}

/**
 * Character bigrams, with the spaces taken out first.
 *
 * Stripping the spaces is what makes "sunnyside" and "Sunny Side" score 1.0
 * against each other instead of losing every gram that spans the boundary.
 * People type restaurant names closed up about as often as they space them,
 * and that difference is not a spelling mistake worth punishing.
 */
export function grams(value: string): Set<string> {
  const flat = value.replace(/ /g, "");
  const out = new Set<string>();
  for (let i = 0; i < flat.length - 1; i++) out.add(flat.slice(i, i + 2));
  return out;
}

/**
 * Dice coefficient over two bigram sets: `2 * shared / (a + b)`.
 *
 * The cheapest similarity that survives a typo without shipping an edit-
 * distance table. Measured against this corpus in the draft search model it
 * came from: "vietnemese" scores 0.78 against Vietnamese and "gaslmap" 0.50
 * against Gaslamp, while keyboard mash reaches 0.29 against "Pizza" on a
 * single shared gram — which is why there is a floor and not just an ordering.
 */
export function dice(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  // Iterate the smaller set: the work is one lookup per gram either way, and
  // names here run to forty characters against queries of six.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const gram of small) if (large.has(gram)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/**
 * How alike two strings are, 0 to 1, by the better of two readings.
 *
 * A single Dice score over the whole string is not enough, because the common
 * real failure is **one wrong letter inside one word of a multi-word name**,
 * and a long correct remainder drowns it. So the score is the greater of:
 *
 * - **whole-string** similarity, which catches respacing and transposition
 *   across a word boundary; and
 * - **per-token best match** — for each query token, the best score against any
 *   name token, averaged. `kairoa brewng` scores 1.00 on `kairoa` and 0.73 on
 *   `brewing` and lands at 0.86, instead of being averaged into the noise of a
 *   name the visitor only typed part of.
 *
 * The per-token reading is also what handles a *short* query against a long
 * name: "kairoa" against "Kairoa Brewing Company" is 0.42 whole-string, because
 * two thirds of the name was never typed, and 1.00 per-token. The visitor is
 * not wrong for having typed less than the sign says.
 */
export function similarity(query: Prepared, target: Prepared): number {
  const whole = dice(query.grams, target.grams);
  if (query.tokens.length === 0 || target.tokens.length === 0) return whole;

  let total = 0;
  for (const qGrams of query.tokenGrams) {
    let best = 0;
    for (const tGrams of target.tokenGrams) {
      const score = dice(qGrams, tGrams);
      if (score > best) best = score;
    }
    total += best;
  }
  return Math.max(whole, total / query.tokenGrams.length);
}

/* --- Prepared strings ----------------------------------------------------- */

/**
 * A string with its normalisation and both gram sets computed once.
 *
 * Every restaurant name is compared against every query, so the sets are built
 * when the row enters the corpus cache and reused for a minute rather than
 * rebuilt per keystroke. Nothing here is expensive; doing it 9,043 times per
 * facet pass per request would be.
 */
export type Prepared = {
  /** Normalised text. `""` when the source was empty or all punctuation. */
  text: string;
  tokens: string[];
  grams: Set<string>;
  /** One gram set per token, for the per-token reading in `similarity`. */
  tokenGrams: Set<string>[];
};

export function prepare(value: string | null | undefined): Prepared {
  const text = normalize(value ?? "");
  const tokens = tokenize(text);
  return { text, tokens, grams: grams(text), tokenGrams: tokens.map(grams) };
}

/** The empty prepared string, for a row missing a field. Matches nothing. */
export const NOTHING: Prepared = { text: "", tokens: [], grams: new Set(), tokenGrams: [] };

/* --- The floor ------------------------------------------------------------ */

/**
 * Below this similarity, two strings have nothing to do with each other.
 *
 * This gates whether a restaurant is *findable at all*, which is a heavier job
 * than the 0.34 the draft "did you mean" list used — there a wrong guess costs
 * one row of three, here it decides between an empty grid and a wall of noise.
 * Set from the sweep in probe/typo-calibrate.mts, which injects seven shapes of
 * realistic typo into real listed names and reports, per candidate floor, how
 * often the true restaurant comes back *first* and how many rows clear the
 * floor at all. Re-run that script rather than nudging this by feel.
 *
 * 0.65 is the knee, measured over 600 names and 4,016 typo queries:
 *
 * ```
 * floor   first   median results   p90 results
 * 0.50    95.9%               27          275
 * 0.60    95.6%                7           69
 * 0.65    95.3%                3           33   <- here
 * 0.70    94.2%                2           20
 * 0.80    89.3%                1           10
 * ```
 *
 * Accuracy is flat from 0.30 to 0.65 — the ~4% that never rank first are
 * queries a *different* real restaurant answers better, which no floor fixes —
 * while the result set falls by two orders of magnitude. Above 0.65 the floor
 * starts cutting true matches instead of noise, and transposition goes first
 * (89% at 0.65, 80% at 0.75, 48% at 0.85) because swapping two letters destroys
 * two bigrams at once. Don't raise this to tidy the result count; the tiers do
 * that ordering already.
 */
export const SIMILAR_ENOUGH = 0.65;

/**
 * A weaker floor for cuisines and neighbourhoods.
 *
 * The vocabulary is tiny and closed — 29 cuisines, a few dozen neighbourhoods —
 * so a loose floor cannot flood anything the way a loose floor over 9,043 names
 * would. "vietnemese" needs to reach Vietnamese, and it is the only word in the
 * list it could possibly mean.
 */
export const VOCABULARY_ENOUGH = 0.5;

/* --- The ladder ----------------------------------------------------------- */

/**
 * The tiers, ordered by what the visitor meant, not by which field happened
 * to hold the word.
 *
 * The ordering is Calvin's (2026-09-13, reversing 2026-09-07): **a category
 * word means the nearest places of that kind, so a literal cuisine match
 * outranks everything except a literal or whole-name match.** A whole sign
 * typed exactly is still unambiguously that one place (NAME_EXACT), and a
 * correctly spelled first word of a sign (NAME_PREFIX) is a stronger signal
 * than a misspelled cuisine — which is why CUISINE_FUZZY sits *under*
 * NAME_PREFIX and above every other name rung. Below that, cuisine beats
 * name: CUISINE_SUBSTRING (a category word appearing inside a longer cuisine
 * label) outranks NAME_TOKENS, NAME_SUBSTRING and NAME_FUZZY, because none of
 * those name rungs are a literal cuisine match either — they are all softer
 * readings of the name field, and a literal reading of a different field
 * beats a soft reading of this one.
 *
 * Two rungs carry a bonus and keep the 100-point gap to the rung above them
 * so the bonus can never reach it: NAME_TOKENS (+0-99, so 800-899, which is
 * why every cuisine rung and NAME_PREFIX sit at 930 or above) and NAME_FUZZY
 * (+0-100).
 */
export const TIER = {
  NAME_EXACT: 1000,
  CUISINE_EXACT: 960,
  CUISINE_SUBSTRING: 950,
  NAME_PREFIX: 940,
  CUISINE_FUZZY: 930,
  /* A tag ("Tacos", "Sushi") is not the canonical cuisine — it is the looser
     net that stands in for one (see data/cuisines.ts SYNONYMS) — and since
     2026-09-13 that net also carries broad meal-time words like "Breakfast"
     against hundreds of coffee shops, juice bars and bakeries at once. Sharing
     a tier with the real cuisine match is how "breakfast" buried the actual
     Breakfast & Brunch places under a wall of tag-only coffee shops (Calvin
     saw this near SDSU): a hundred rows tied for first, distance broke the
     tie, and volume alone put the closest coffee shop over the farther real
     match. Its own band, 30 points under CUISINE_FUZZY, keeps a tag match a
     real, literal signal — still well above a name's coverage bonus for a
     narrow tag like "tacos" — while guaranteeing every restaurant whose
     *cuisine itself* is what was typed sorts first. */
  CUISINE_TAG_EXACT: 920,
  CUISINE_TAG_SUBSTRING: 910,
  CUISINE_TAG_FUZZY: 900,
  /** Every query word is in the name, in any order. Carries a 0-99 bonus. */
  NAME_TOKENS: 800,
  NAME_SUBSTRING: 700,
  /** Carries a 0-100 bonus from the similarity, so 500-600. */
  NAME_FUZZY: 500,
  NEIGHBORHOOD_EXACT: 260,
  NEIGHBORHOOD_SUBSTRING: 250,
  NEIGHBORHOOD_FUZZY: 240,
  DISH_EXACT: 220,
  DISH_SUBSTRING: 200,
} as const;

/** The lowest score that still counts as "this matched on the name". */
export const NAME_FLOOR = TIER.NAME_FUZZY;

/**
 * The four prepared fields a restaurant is searched on, kept apart.
 *
 * Apart, and not concatenated, is the entire structural change: field priority
 * is only expressible if the match knows which field it landed in.
 */
export type SearchFields = {
  name: Prepared;
  cuisine: Prepared;
  /** The specific labels behind the canonical cuisine — see data/cuisines.ts. */
  tags: Prepared;
  neighborhood: Prepared;
};

/**
 * A name match: the tier it landed in, and whether that tier was the fuzzy one.
 *
 * `fuzzy` is what the floor gates. The tiers above it are exact tests and no
 * floor can change them, which is why the sweep only has to re-decide this one.
 */
export type NameMatch = { score: number; fuzzy: boolean };

/**
 * How well a query matches one restaurant's name. 0 when it does not.
 *
 * The tiers are tried best-first and the first hit wins, so the cheap exact
 * tests run before the gram arithmetic and the fuzzy pass only happens for rows
 * nothing else claimed.
 */
export function scoreName(query: Prepared, name: Prepared): number {
  const match = explainName(query, name);
  if (match.fuzzy && match.score < SIMILAR_ENOUGH_SCORE) return 0;
  return match.score;
}

/** The lowest fuzzy score the floor admits, precomputed so `scoreName` is one
 *  comparison rather than a second round of arithmetic per row. */
const SIMILAR_ENOUGH_SCORE = TIER.NAME_FUZZY + Math.round(100 * SIMILAR_ENOUGH);

/**
 * `scoreName` without the fuzzy floor applied, and reporting the similarity it
 * measured — the shape probe/typo-calibrate.mts needs to sweep candidate floors
 * without running the ladder once per floor.
 *
 * `similarity` is only meaningful when the score landed in the fuzzy band; the
 * tiers above it are exact tests that no floor can change. Kept beside the real
 * scorer, and called by it, so the thing being calibrated is the thing that
 * ships — a second copy of this cascade in the script would be calibrating
 * itself.
 */
export function explainName(query: Prepared, name: Prepared): NameMatch {
  const none = { score: 0, fuzzy: false };
  if (!query.text || !name.text) return none;
  if (name.text === query.text) return { score: TIER.NAME_EXACT, fuzzy: false };
  if (name.text.startsWith(query.text)) return { score: TIER.NAME_PREFIX, fuzzy: false };

  /* Every query word has to appear in the name as the start of some word, in
     any order. This is the tier that answers "Solana Sunny Side" for a row
     stored as "Sunny Side Solana", and "Kairoa Brewing" for one stored as
     "Kairoa Brewing Company" — the two shapes a substring test cannot reach.

     Prefix rather than equality so a half-typed last word still counts, which
     is what makes this useful while someone is still typing. */
  const covered = new Set<number>();
  let matchedAll = true;
  for (const word of query.tokens) {
    let found = -1;
    for (let i = 0; i < name.tokens.length; i++) {
      if (!covered.has(i) && name.tokens[i].startsWith(word)) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      matchedAll = false;
      break;
    }
    covered.add(found);
  }
  if (matchedAll) {
    /* How much of the *name* the query accounted for, so "Sunny Side Solana"
       beats "Sunny Side Solana Beach Cafe And Bakery" for "sunny side solana".
       Capped below 100 so it can never reach the tier above. */
    const coverage = Math.min(99, Math.round((99 * covered.size) / name.tokens.length));
    return { score: TIER.NAME_TOKENS + coverage, fuzzy: false };
  }

  if (name.text.includes(query.text)) return { score: TIER.NAME_SUBSTRING, fuzzy: false };

  /* Below four letters, dice-bigram similarity is mostly noise — see the same
     guard and "cod"/"Co." example on `scoreVocabulary`. A short query still
     gets exact/prefix/tokens/substring above; it just cannot fuzzy-match. */
  if (query.text.length <= 4) return none;

  /* The only tier a floor applies to, and so the only one the calibration
     sweep can move. Scored here without it; `scoreName` decides admission. */
  const close = similarity(query, name);
  return { score: TIER.NAME_FUZZY + Math.min(100, Math.round(100 * close)), fuzzy: true };
}

/**
 * Whether `needle` occurs in `haystack` on a word boundary — not merely as a
 * run of characters. Both strings are already `normalize()`d, so the only
 * separator either one has is a single space, which is what this checks
 * either side of a hit for.
 *
 * A plain `.includes()` here is how "fast" used to substring-match "Breakfast
 * & Brunch" (the tag is one word, "breakfast", and "fast" is the back half of
 * it) and "food" matched "Seafood" the same way — real cuisine words, real
 * corpus values, and no relation to the query at all. The vocabulary is short
 * and closed, so the fix does not need `scoreName`'s token machinery: find
 * every occurrence and require a space or an edge on both sides.
 */
function includesWholeWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return false;
    const before = i === 0 || haystack[i - 1] === " ";
    const after = i + needle.length === haystack.length || haystack[i + needle.length] === " ";
    if (before && after) return true;
    from = i + 1;
  }
}

/** Exact, then substring, then fuzzy against one short controlled-vocabulary
 *  field. Returns 0, or the tier the caller passed for whichever hit. */
function scoreVocabulary(
  query: Prepared,
  field: Prepared,
  tiers: { exact: number; substring: number; fuzzy: number },
): number {
  if (!query.text || !field.text) return 0;
  if (field.text === query.text) return tiers.exact;
  if (includesWholeWord(field.text, query.text)) return tiers.substring;

  /* Below four letters, dice-bigram similarity is mostly noise: "cod" and
     "Co." share the bigram "co" and that alone clears 0.65, which is how a
     search for the fish put coffee shops on the page and not one cod dish.
     A short query still gets every exact/prefix/whole-word rung above this —
     it only loses the license to be "close enough" to something it never
     spelled. */
  if (query.text.length <= 4) return 0;

  /* `similarity`'s per-token reading was built for a short *query* against a
     long *name* — every query token gets to find its own best partner and
     the credit is *averaged*, which is right when the query is the thing
     that's incomplete: a well-matched word should not be dragged down by a
     word the visitor never typed. Run that average the other way — a
     multi-word *query* against a short, closed vocabulary field — and one
     word that happens to spell a tag exactly (the "sushi" in "sushi umi",
     the "cafe" in "cafe mesa") carries the average over the floor on its
     own, however unrelated the query's *other* word is. That is how a
     restaurant named "Umi Sushi" lost to every Sushi Bar in town for the
     query "sushi umi", and "Mesa Cafe" lost to a page of Coffee & Tea shops
     for "cafe mesa": the second word never had to relate to the vocabulary
     at all, it just rode along.
     So for a multi-word query, every one of its words has to individually
     clear a floor against *some* word of the field before the average is
     trusted — a partial floor (0.3), not `VOCABULARY_ENOUGH`, because a
     genuinely typo'd second word ("breakfst brunch") still needs room. A
     single-word query (a typo of the cuisine itself, e.g. "mexcian") skips
     this: it is exactly what this rung is for, and there is no second word
     to smuggle anything past it. */
  if (query.tokens.length > 1) {
    let worst = 1;
    for (const qGrams of query.tokenGrams) {
      let best = 0;
      for (const tGrams of field.tokenGrams) best = Math.max(best, dice(qGrams, tGrams));
      worst = Math.min(worst, best);
    }
    if (worst < 0.3) return 0;
  }

  /* A single word compared whole-string against a much longer one can clear
     VOCABULARY_ENOUGH by coincidence, not typo: "panera" (5 bigrams) is
     0.50 similar to "mediterranean" (11 bigrams) the same way it is 0.50
     similar to "japanese" — four of its five bigrams happen to occur
     somewhere in the longer word, which is what a 29-word vocabulary and a
     short query make likely, not evidence of a misspelling. Every real typo
     this floor exists for keeps the word's own length — "itlaian"/"italian",
     "gaslmap"/"gaslamp", "vietnemese"/"vietnamese" are all typo and target at
     the same length — so a query more than about twice (or less than half)
     the field's length is never that, and is refused before the coincidence
     can fire. Multi-word queries already passed their own per-token floor
     above and are not touched here. */
  if (query.tokens.length <= 1) {
    const longer = Math.max(query.text.length, field.text.length);
    const shorter = Math.min(query.text.length, field.text.length);
    if (longer > shorter * 1.8) return 0;
  }

  const close = similarity(query, field);
  if (close < VOCABULARY_ENOUGH) return 0;
  // A 0-9 closeness bonus, the same signal the fuzzy name rung carries but
  // in the ten points of headroom a fuzzy vocabulary rung has. Without it
  // "breaksfast" put Fast Food shops (0.50 to "fast food") level with the
  // Breakfast ones (0.82) and distance decided between them. See `rungOf`.
  return tiers.fuzzy + Math.min(9, Math.floor(10 * close));
}

/**
 * A vocabulary term against a query, for the search dropdown's own groups.
 *
 * `scoreVocabulary` answers "does this restaurant's cuisine field match", which
 * is a different question from "which cuisines should I offer". Offering needs
 * a **prefix** rung — typing "vie" should put Vietnamese at the top of a list,
 * where for a restaurant row exact-versus-substring is all that matters — and
 * it needs to report whether the hit was fuzzy, because a correction is
 * labelled differently on the dropdown ("Did you mean") from a literal hit.
 *
 * The ranks order one group against itself and are deliberately *not* on the
 * TIER scale: a fuzzy rank is the similarity itself, which is at most 1 and so
 * always sorts under the literal rungs. Never compare one to a TIER value.
 */
export type TermMatch = { rank: number; fuzzy: boolean } | null;

export function explainTerm(query: Prepared, term: Prepared): TermMatch {
  if (!query.text || !term.text) return null;
  if (term.text === query.text) return { rank: 4, fuzzy: false };
  if (term.text.startsWith(query.text)) return { rank: 3, fuzzy: false };
  if (term.text.includes(query.text)) return { rank: 2, fuzzy: false };
  // Same coincidence guard as `scoreVocabulary`: a short word can clear
  // VOCABULARY_ENOUGH against an unrelated long one by accident of overlap
  // rather than by being a typo of it (see the "panera"/"mediterranean" note
  // there). Real typos keep the term's own length.
  if (query.tokens.length <= 1) {
    const longer = Math.max(query.text.length, term.text.length);
    const shorter = Math.min(query.text.length, term.text.length);
    if (longer > shorter * 1.8) return null;
  }
  const close = similarity(query, term);
  return close >= VOCABULARY_ENOUGH ? { rank: close, fuzzy: true } : null;
}

/**
 * How well a query matches a restaurant's cuisine or its search tags.
 *
 * The tags are what keep the blunt filter vocabulary affordable: "tacos" is not
 * a cuisine any more — it folds into Mexican — so it arrives as free text, and
 * the tag on a shop tagged `taco` is what answers it. See data/cuisines.ts.
 * A tag scores the same as the cuisine itself; the distinction the visitor
 * cares about is name-or-not.
 */
export function scoreCuisine(query: Prepared, fields: SearchFields): number {
  return Math.max(
    scoreVocabulary(query, fields.cuisine, {
      exact: TIER.CUISINE_EXACT,
      substring: TIER.CUISINE_SUBSTRING,
      fuzzy: TIER.CUISINE_FUZZY,
    }),
    // The tag field's own, lower band — see the TIER.CUISINE_TAG_* comment.
    // A tag is the looser net data/cuisines.ts stands in for a cuisine with,
    // and since it can now name a hundred restaurants for one meal-time word
    // ("breakfast"), it must never tie the field it is standing in for.
    scoreVocabulary(query, fields.tags, {
      exact: TIER.CUISINE_TAG_EXACT,
      substring: TIER.CUISINE_TAG_SUBSTRING,
      fuzzy: TIER.CUISINE_TAG_FUZZY,
    }),
  );
}

export function scoreNeighborhood(query: Prepared, fields: SearchFields): number {
  return scoreVocabulary(query, fields.neighborhood, {
    exact: TIER.NEIGHBORHOOD_EXACT,
    substring: TIER.NEIGHBORHOOD_SUBSTRING,
    fuzzy: TIER.NEIGHBORHOOD_FUZZY,
  });
}

/**
 * A restaurant's total relevance to a query, or 0 for no match at all.
 *
 * Name and cuisine are no longer a strict cascade — the ladder now interleaves
 * them (CUISINE_SUBSTRING outranks NAME_TOKENS, for instance), so both have to
 * be scored and the higher one kept; returning on the first hit, as this used
 * to, would silently reintroduce "name first" for every row that happens to
 * match its name before its cuisine is even checked. Neighbourhood and dish
 * stay a cascade below that: they sit under every name and cuisine rung, so
 * the first of them to hit is also the best available.
 *
 * `dish` is the name of the menu item that matched, when one did — the lookup
 * that produced it is the caller's, because the corpus deliberately holds no
 * dishes (see `dishMatchesFor` in lib/db.ts). Its *presence* is the match; this
 * only decides exact-versus-partial, and either way it sits below every name
 * and cuisine tier.
 *
 * A restaurant whose *entire name* is a plain category word — one literally
 * called "Tacos" or "Pizza" — can still win NAME_EXACT here even though the
 * theory behind that tier (a whole sign typed exactly can only mean the one
 * place with that sign) does not hold when the sign itself is the category
 * word. This function only sees one row at a time and cannot tell "In-N-Out"
 * apart from "Tacos" that way — a corpus-wide check for whether the query
 * names a real category *anywhere* is needed first, so that demotion lives
 * one level up, in `discoverFilters.ts`'s `scoreMatches` and `suggest.ts`'s
 * `scan` (see the comment there — BACKLOG.md "literal-name trap"). Do not
 * "fix" it here with a per-row guard on this restaurant's own cuisine/tags:
 * that was tried and silently failed on the reported case, because the
 * restaurant literally named "Tacos" carried the generic imported tag
 * "Mexican Restaurant", not "Tacos" — this row's own fields do not know the
 * query is a category word at all.
 */
export function scoreRestaurant(
  query: Prepared,
  fields: SearchFields,
  dish?: string | null,
): number {
  const name = scoreName(query, fields.name);
  const cuisine = scoreCuisine(query, fields);
  const best = Math.max(name, cuisine);
  if (best > 0) return best;

  const neighborhood = scoreNeighborhood(query, fields);
  if (neighborhood > 0) return neighborhood;

  if (dish) {
    return normalize(dish) === query.text ? TIER.DISH_EXACT : TIER.DISH_SUBSTRING;
  }
  return 0;
}

/**
 * The four readings a typed term can have — one per field `scoreRestaurant`
 * tries, in the order it tries them.
 *
 * The same four strings as `SuggestKind` in lib/suggestTypes.ts, declared twice
 * on purpose: that module imports nothing so client components can have it (see
 * its header), and this one is the ladder's own vocabulary. Both are structural
 * unions, so TypeScript still catches them drifting apart at every boundary
 * they meet.
 */
export type SearchScope = "restaurant" | "cuisine" | "neighborhood" | "dish";

/** In the order the ladder ranks them, for anything iterating the readings. */
export const SEARCH_SCOPES: readonly SearchScope[] = [
  "restaurant",
  "cuisine",
  "neighborhood",
  "dish",
];

/**
 * Which field a score landed in — the ladder read backwards.
 *
 * `scoreRestaurant` now interleaves name and cuisine rungs (CUISINE_SUBSTRING
 * outranks NAME_TOKENS, for instance), so "everything from here up is field X"
 * is no longer true of a single contiguous band — the old bound-per-field
 * comparison broke the moment cuisine moved off the bottom of the ladder. This
 * is a lookup instead: every `TIER` key names its scope by its prefix, the
 * keys are sorted into rungs biggest-first, and a score is filed under the
 * highest rung it clears. Built off `TIER` rather than written out again, so a
 * retuned tier cannot leave this behind. What lets a search be *scoped* is
 * still this table: `?q=cannonball&in=dish` keeps the rows that matched on a
 * dish and drops the ones that matched on a name.
 *
 * Null for a score of zero: that is not a field, it is a miss.
 */
const TIER_SCOPE: Readonly<Record<keyof typeof TIER, SearchScope>> = {
  NAME_EXACT: "restaurant",
  CUISINE_EXACT: "cuisine",
  CUISINE_SUBSTRING: "cuisine",
  NAME_PREFIX: "restaurant",
  CUISINE_FUZZY: "cuisine",
  CUISINE_TAG_EXACT: "cuisine",
  CUISINE_TAG_SUBSTRING: "cuisine",
  CUISINE_TAG_FUZZY: "cuisine",
  NAME_TOKENS: "restaurant",
  NAME_SUBSTRING: "restaurant",
  NAME_FUZZY: "restaurant",
  NEIGHBORHOOD_EXACT: "neighborhood",
  NEIGHBORHOOD_SUBSTRING: "neighborhood",
  NEIGHBORHOOD_FUZZY: "neighborhood",
  DISH_EXACT: "dish",
  DISH_SUBSTRING: "dish",
};

/** `TIER`'s rungs, biggest first, each carrying the scope its key names. Two
 *  rungs carry a bonus (NAME_TOKENS, NAME_FUZZY) so "largest rung the score
 *  clears" — not exact equality — is what files it. */
const RUNG_SCOPE: readonly { rung: number; scope: SearchScope }[] = (
  Object.entries(TIER) as [keyof typeof TIER, number][]
)
  .map(([key, rung]) => ({ rung, scope: TIER_SCOPE[key] }))
  .sort((a, b) => b.rung - a.rung);

export function scopeOf(score: number): SearchScope | null {
  if (score <= 0) return null;
  for (const { rung, scope } of RUNG_SCOPE) if (score >= rung) return scope;
  return null;
}

/**
 * Whether a score is a literal hit rather than a correction, in its own band.
 *
 * Each field's fuzzy rung sits at the bottom of that field's rungs, so "did
 * the visitor's spelling actually appear" is one comparison against the
 * lowest literal rung `scopeOf` could have filed the score under for that
 * scope. Dishes have no fuzzy rung here at all — that pass is trigram
 * matching in Postgres, and a dish score reaching this function is always
 * literal.
 */
export function isLiteralScore(score: number): boolean {
  const scope = scopeOf(score);
  if (scope === "restaurant") return score >= TIER.NAME_SUBSTRING;
  // The lowest literal cuisine rung is now the tag's substring rung, not the
  // canonical cuisine's — a tag match is still the visitor's own spelling,
  // just a weaker field than the cuisine itself. Only CUISINE_TAG_FUZZY below
  // it is a correction.
  if (scope === "cuisine") return score >= TIER.CUISINE_TAG_SUBSTRING;
  if (scope === "neighborhood") return score >= TIER.NEIGHBORHOOD_SUBSTRING;
  return scope !== null;
}

/* --- Rungs, for a caller that wants distance to actually get a vote -------- */

/** Every rung on the ladder, biggest first. Built off `TIER` so a retuned tier
 *  cannot leave this behind, the same way `scopeOf` reads its bounds off it. */
const RUNGS: readonly number[] = [...new Set<number>(Object.values(TIER))].sort((a, b) => b - a);

/**
 * How coarsely a fuzzy name score is compared — 10 points, so 0.1 of measured
 * similarity. See `rungOf`.
 */
const SIMILARITY_STEP = 10;

/**
 * A score reduced to the thing a tiebreak is allowed to see past.
 *
 * The invariant at the top of this file says a tiebreak may reorder *within* a
 * tier and never across one. Two rungs carry a 0-99 bonus on top of the tier,
 * though, and a caller comparing raw scores therefore almost never sees a tie
 * to break — which is how "nearest among equals" quietly stopped applying to
 * most real queries. Searching "pizza", `Bronx Pizza` scores 800+50 (one of two
 * name words matched) and `Buona Forchetta Pizza Napoletana` 800+25 (one of
 * four), so the shorter name wins by 25 points and distance is never consulted.
 * That gap measures how long the sign is, not how well the row answers.
 *
 * So the token-coverage bonus is dropped here and the row is compared on its
 * rung. The fuzzy bonus is *not* dropped, because there it is a real signal —
 * it is measured similarity, and on a misspelled name the row scoring 0.92
 * genuinely answers better than the one scoring 0.68. It is rounded down to
 * 0.1 instead, so near-equal spellings tie and distance decides between them
 * while a clearly better one still wins. probe/typo-calibrate.mts is what
 * calibrated that band; nothing here changes which rows clear its floor.
 *
 * Monotonic and never crosses a band, so `scopeOf` and `isLiteralScore` still
 * answer the same thing about a rung as about the score it came from.
 *
 * One more collapse on top of the fuzzy-name one: CUISINE_EXACT and
 * CUISINE_SUBSTRING fold onto a single rung (CUISINE_SUBSTRING) here, so a row
 * tagged exactly "Breakfast" and one whose cuisine is worded "Breakfast &
 * Brunch" tie instead of the exact one always winning. That gap measures how
 * the label was written, not how well the row answers the query — the same
 * complaint the coverage-bonus drop above makes about name length — so
 * distance decides between them instead of spelling of the cuisine field.
 * CUISINE_FUZZY is not collapsed but banded, like the fuzzy name rung: the
 * 0-9 closeness bonus `scoreVocabulary` adds is already a 0.1 band of
 * measured similarity, so it is kept as the rung. On "breaksfast" the rows
 * tagged Breakfast (0.82, rung 938) then sit above the Fast Food rows (0.50,
 * rung 935) that the same fuzzy threshold lets through, and distance orders
 * within each band instead of across them. The neighborhood fuzzy rung gets
 * the same bonus from `scoreVocabulary` but is not banded here — it falls
 * through to its tier, as before, because nothing competes with it there.
 */
export function rungOf(score: number): number {
  if (score <= 0) return 0;
  if (score >= TIER.NAME_FUZZY && score < TIER.NAME_SUBSTRING) {
    const bonus = Math.floor((score - TIER.NAME_FUZZY) / SIMILARITY_STEP) * SIMILARITY_STEP;
    return TIER.NAME_FUZZY + bonus;
  }
  if (score === TIER.CUISINE_EXACT || score === TIER.CUISINE_SUBSTRING) {
    return TIER.CUISINE_SUBSTRING;
  }
  if (score >= TIER.CUISINE_FUZZY && score < TIER.NAME_PREFIX) return score;
  for (const rung of RUNGS) if (score >= rung) return rung;
  return 0;
}
