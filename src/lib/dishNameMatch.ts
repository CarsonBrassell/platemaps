/**
 * When two typed dish names are the same dish spelled differently.
 *
 * This answers one narrow question — "is this a misspelling of that?" — and it
 * deliberately cannot answer the broader one, "are these the same dish?". The
 * distinction is the whole design. `scripts/dish-review.mjs` uses this to build
 * a review queue out of what people typed into the composer's free-text dish
 * box, and a matcher that merged on *meaning* would hand that queue pairs like
 * "Carne Asada Fries" / "Carne Asada Burrito" — same kitchen, same cuisine, 80%
 * of the same characters, different food. Whole-string similarity (which is
 * what `nearestDishName` in lib/db.ts uses, correctly, for spell-correcting a
 * search box) produces exactly that. So this works per *word* instead.
 *
 * ## The rule
 *
 * **Equal word count** — every word has to match its counterpart, and how much
 * slack a word gets depends on its length (see `fuzzBudget`). A differing word
 * that is not a plausible typo of its counterpart rejects the whole pair, which
 * is what keeps "… fries" away from "… burrito".
 *
 * **Different word count** — the folds have to be *exactly* equal once every
 * space is removed. That is the missing-space case and nothing else:
 * "carneasada fries" vs "carne asada fries". It is reported at low confidence
 * because a space error is rarer than a letter error and the evidence is
 * thinner.
 *
 * The joined comparison is exact-only, and restricted to unequal word counts,
 * because of a collision worth naming: "pho tai" and "pho gai" are one
 * character apart and two different bowls. Vietnamese and Thai menus are full
 * of three-letter words that distinguish the dish, which is why `SHORT_WORD`
 * words must match exactly — and why a fuzzy comparison over the joined form,
 * where there are no word boundaries left to apply that rule to, would let
 * "photai"/"phogai" straight through.
 */

/* Relative and with the extension, not `@/lib/brandName`: the two review
   scripts load this module under plain Node, which knows nothing of the path
   alias and needs the file named in full. brandName.ts has no imports of its
   own, which is what makes it loadable that way — keep it so. */
import { foldAccents } from "./brandName.ts";

/**
 * Words this long or shorter must match exactly.
 *
 * Four rather than three because of the same menus: "goi", "bun", "mee", "roti"
 * and "nasi" all pick out the dish, and one edit is most of a word that short.
 * The cost of the bound is that a genuine typo in a short word ("tacoss" is
 * fine at 6, but "taco"/"taoc" is not caught) goes to the review queue as a
 * separate cluster instead of merging — a miss, not a wrong merge, and misses
 * are the cheap failure here.
 */
export const SHORT_WORD = 4;

/** Edits allowed in a word, by its length. 0 for anything `SHORT_WORD` or under. */
export function fuzzBudget(length: number): number {
  if (length <= SHORT_WORD) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * The fold, and it has to agree **exactly** with `dishes.name_folded` in
 * scripts/migrate.mjs and with the `posts.dish_name_folded` column added
 * alongside it: accents off first, then lowercase, `&` spelled out,
 * apostrophes *removed* so "chef's" becomes "chefs" rather than "chef s", every
 * other run of non-alphanumerics collapsed to one space, trimmed.
 *
 * Accents come off **before** the alphanumeric pass, or they never come off at
 * all: `è` is not in `a-z`, so without that step it became a space and "Crème
 * Brûlée" folded to "cr me br l e" — a different string from what "Creme
 * Brulee" folds to, so the two never met in the review queue and never matched
 * in `?dish=`. Nobody types the accents and the menus are inconsistent about
 * them, so the fold treats the two spellings as one word. `foldAccents` is the
 * function `normalize()` in textMatch.ts uses; the SQL side is `unaccent`
 * behind an immutable wrapper, `fold_accents()`.
 *
 * Written out here as well as in SQL because the review script reads the stored
 * column while a browser has only the text someone is typing. Three copies
 * would be two too many; these two are the minimum, and a drift between them
 * shows up as a dish that plainly matches the menu being offered as new.
 */
export function foldDishName(name: string): string {
  return foldAccents(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Levenshtein distance, abandoned as soon as it is known to exceed `max`.
 *
 * Bounded rather than complete because every caller only ever compares the
 * answer against a threshold, and the review script runs this across every pair
 * of dish names within a restaurant. The early exit is what keeps that from
 * being the slow part: two words that share no letters stop after one row.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (max === 0) return 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    /* Every distance from here on is at least this row's minimum, so once the
       whole row is past the budget the answer cannot come back under it. */
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** One word against its counterpart, under the length-dependent budget. */
export function wordIsTypoOf(a: string, b: string): boolean {
  if (a === b) return true;
  /* The budget comes off the *shorter* word. Otherwise "roti" (exact-match
     only) paired with "rotisserie" would borrow the longer word's slack. */
  const budget = fuzzBudget(Math.min(a.length, b.length));
  if (budget === 0) return false;
  return editDistance(a, b, budget) <= budget;
}

export type DishNameVerdict =
  | { match: false }
  | { match: true; confidence: "high" | "low" };

/**
 * Whether two *folded* dish names are one dish spelled two ways.
 *
 * Takes folds, not raw names — the callers already hold the stored folded
 * column and folding twice would be the place the two copies drift.
 */
export function foldedDishesMatch(a: string, b: string): DishNameVerdict {
  if (!a || !b) return { match: false };
  if (a === b) return { match: true, confidence: "high" };

  const aWords = a.split(" ");
  const bWords = b.split(" ");

  if (aWords.length === bWords.length) {
    for (let i = 0; i < aWords.length; i += 1) {
      if (!wordIsTypoOf(aWords[i], bWords[i])) return { match: false };
    }
    return { match: true, confidence: "high" };
  }

  /* Unequal word counts: a space is missing or doubled, or nothing. Exact
     equality once the spaces are gone — see the module note on "photai". */
  if (aWords.join("") === bWords.join("")) return { match: true, confidence: "low" };
  return { match: false };
}
