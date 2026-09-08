/**
 * What two branches of the same restaurant have in common.
 *
 * The corpus holds every branch as its own row - four Poké Chops, fourteen Luna
 * Grills - and nothing in it says they are the same business. The only signal
 * available is the name, and the name is written four different ways by four
 * different sources:
 *
 *   Poké Chop (Hillcrest)      Google, with the accent
 *   Poke Chop (Pacific Beach)  OpenStreetMap, without it
 *   Luna Grill Hillcrest       Google, branch in the name
 *   Luna Grill (Mission Hills) Google, branch not in the name
 *   Roberto’s Taco Shop - Santee / Roberto's Taco Shop
 *
 * `brandName` reduces all of those to one key. Two rules, both conservative:
 *
 *   1. **Fold accents and punctuation.** `é` is `e`, `’` is `'` is nothing.
 *      This is the rule that was missing: it is why searching "poke chop"
 *      returned the two spelled without the accent - the two furthest from the
 *      reader - and never mentioned the two nearest.
 *   2. **Drop a trailing place name**, but only the one this row is actually
 *      in. "Luna Grill Hillcrest" is a Luna Grill when the row's own
 *      neighbourhood is Hillcrest; it is not evidence about any other name.
 *      Stripping against a global list of place names would have merged "Pho
 *      Oceanside" into "Phở Carlsbad" - both reduce to "pho" - which is why
 *      the caller passes only this row's own labels.
 *
 * The floor at `MIN_KEY_LENGTH` is the other half of that guard: a key short
 * enough to be a generic word ("pho", "cafe") is not a brand, so the strip is
 * refused and the full name is kept.
 */

/** Below this many characters a stripped key is a food word, not a brand. */
const MIN_KEY_LENGTH = 6;

/**
 * Accent-blind, case-blind text.
 *
 * NFD splits `é` into `e` + a combining acute, and the range below is every
 * combining mark Unicode defines, so this covers Vietnamese (`ở`, `ầ`) and
 * Spanish (`ñ`, `í`) alike rather than a hand-written table of the ones we
 * happened to notice. `ñ` -> `n` is the intended behaviour: a reader typing
 * "senor grubbys" is looking for Señor Grubby's.
 */
export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Folded, punctuation-free, comparable. `Roberto’s Taco Shop` -> `robertostacoshop`. */
export function nameKey(s: string): string {
  return foldAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The brand key for one row: its name with its own branch label removed.
 *
 * `places` is whatever this row calls where it is - its neighbourhood and its
 * city. Only a suffix matching one of those is dropped, and only when what is
 * left still looks like a name.
 */
export function brandKey(name: string, places: readonly (string | null | undefined)[]): string {
  const folded = foldAccents(name).toLowerCase().trim();
  const candidates = places
    .filter((p): p is string => Boolean(p))
    .map((p) => foldAccents(p).toLowerCase().trim())
    .filter(Boolean);

  for (const place of candidates) {
    /* Separated by a dash, a comma or a plain space - "Luna Grill Hillcrest",
       "Roberto’s Taco Shop - Santee", "Farmer's Table, Chula Vista" all read
       the same way to a human. The leading boundary is required so "Poway"
       cannot strip the tail of a name that merely ends in those letters. */
    const match = folded.match(
      new RegExp(`^(.*?)[\\s]*(?:[-–—,]\\s*)?${escapeRegExp(place)}$`),
    );
    if (!match) continue;
    const base = match[1].trim();
    const key = base.replace(/[^a-z0-9]/g, "");
    if (key.length >= MIN_KEY_LENGTH) return key;
  }
  return nameKey(name);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
