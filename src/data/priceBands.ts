/**
 * A price band per restaurant, estimating what one person actually spends
 * rather than what one dish costs.
 *
 * Yelp's own `price` field was never fetched — `scripts/fetch-restaurants.mjs`
 * doesn't request it and `Restaurant` has no column for it — so there is no
 * authoritative $$-style rating to read. What does exist is the menu: the same
 * prices `FullMenu` and `DishSheet` already put on screen.
 *
 * ## Why this is an estimate, and why the old version was one too
 *
 * Banding on the median dish price is also a model — it just hides that it is
 * one. It decides that median beats mean, that some sections aren't real food,
 * and that a single dish's price stands in for the restaurant. That last
 * decision is where it breaks: at a taqueria you order three tacos, at a tapas
 * bar four plates, at a sushi counter several rolls. Costa Brava's median plate
 * is $24 and dinner there is nearer $70. Reading the raw number "neutrally"
 * doesn't avoid a judgment, it just makes a worse one silently, and always in
 * the same direction — every share-plate restaurant looks cheaper than it is.
 *
 * So this estimates spend: the median entrée price times how many of them one
 * person orders, inferred from the menu's own shape and the restaurant's
 * cuisine. That is a claim the menu does not make on its own, which is why the
 * two guards below are not optional.
 *
 * ## The two guards
 *
 * **It never guesses a multiplier.** When the format signal is mixed — the
 * Mexican restaurant serving both à la carte tacos and full combo plates — the
 * answer is not to pick a multiplier and not to give up. It is to drop the
 * share-plate sections and band on the combo plates, which are already one
 * person's meal. See `AMBIGUOUS_SHARE_*`.
 *
 * **It returns null rather than guess.** Same discipline as `plateScore`, which
 * refuses to publish a number off two ratings: below `MIN_PRICED_ENTREES`, or
 * when a mixed menu has no full-size items left to anchor on, there is no band.
 * A null band matches no price filter and the facet counts show the gap,
 * because the four bands don't add up to the total. The gap stays a gap.
 *
 * Nulling the mixed case outright was tried first and cost 51 restaurants their
 * band, 26 of them Mexican — a third of the largest cuisine in the corpus.
 * "Ambiguous" was the wrong word for those menus: nothing about them is unclear,
 * they simply sell two things at once, and one of the two answers the question.
 *
 * **It bands, it never prices.** The public output is `$$$`, never "$47 per
 * person". A band absorbs the error a multiplier introduces; a number invites
 * someone to check it and find it nine dollars off. `spendEstimate` exposes the
 * entrée range it was derived from so a surface can print the receipts beside
 * the judgment — `$$$ · entrées $16–24` is both the summary that makes
 * filtering work and the raw figures that let a visitor overrule it.
 *
 * This file imports nothing at runtime, which is what keeps it safe for the
 * client components that read `PRICE_BANDS`. Nothing in `src/` calls `bandFor`:
 * `db.ts` reads the stored `price_band` column, and the only callers are
 * `scripts/import-restaurants.mjs` and `scripts/recompute-price-bands.mjs`.
 */

export type PriceBand = "$" | "$$" | "$$$" | "$$$$";

/**
 * Estimated spend per person, in dollars, at each band boundary. These are
 * *spend* thresholds, not dish prices — "$30–60" means a meal here runs thirty
 * to sixty dollars a head, which is the steakhouse range, not a menu whose
 * typical item costs $30.
 *
 * `PRICE_BANDS` derives its hints from this array rather than restating them.
 * They used to be two independent literals in this file with nothing tying them
 * together, which is exactly how a filter ends up advertising a range it does
 * not apply.
 */
const BAND_CUTS = [15, 30, 60] as const;

export const PRICE_BANDS: ReadonlyArray<{ value: PriceBand; hint: string }> = [
  { value: "$", hint: `under $${BAND_CUTS[0]}` },
  { value: "$$", hint: `$${BAND_CUTS[0]}–${BAND_CUTS[1]}` },
  { value: "$$$", hint: `$${BAND_CUTS[1]}–${BAND_CUTS[2]}` },
  { value: "$$$$", hint: `$${BAND_CUTS[2]}+` },
];

/**
 * Sections that aren't the thing you came to eat. A place is priced by its
 * entrées: fold in the $3 horchata and the $4 edamame and every restaurant
 * drifts a band cheaper than anyone actually pays.
 *
 * A whole-string regex rather than a Set of exact spellings, because the Set
 * listed five and the corpus does not cooperate: it caught "starters" (336
 * rows) while missing "appetizers" (822), and missed singular "dessert",
 * "beverages", "cocktails" and "soups" entirely. Only used when it leaves
 * something behind — a taqueria listing everything under "Starters" is still
 * priced on its food.
 */
const SIDE_SECTIONS =
  /^(?:starters?|sides?|desserts?|drinks?|salads?|appetizers?|beverages?|cocktails?|beer|wine|sake|soups?|soups? (?:&|and) salads?|small plates?|shareables?|snacks?|kids'?(?: menu)?|children'?s(?: menu)?|sweets?|extras?|add[- ]?ons?|toppings?|sauces?)$/i;

/**
 * Rows priced for a table, not a person: party packs, feasts, "serves 4",
 * "$89 for two", bottles. Left in, they wreck the top of the scale — Tamales
 * Ancira bands above every steakhouse in the city on the strength of two
 * catering packs ($279 and $429), because its actual combos are unpriced, and
 * Rockin' Baja's "$89 for two" bucket reads as $89 a head when it is $44.50.
 */
const BULK_ROW =
  /serves?\s*\d|for\s+(?:two|three|four|\d+)\b|party\s*pack|feast|catering|family\s*(?:meal|pack|style)|\b(?:pack|tray|platter|bucket|combo\s*meal)\b|\bbtl\b|bottle/i;

/**
 * Menus already quoted per person — all-you-can-eat, churrasco, omakase, prix
 * fixe. Multiplying these is the one unambiguous way to be badly wrong:
 * Natsumi's buffet price *is* the spend, and tripling it put a $57 sushi buffet
 * beside Eddie V's. These also survive `BULK_ROW`, which would otherwise strip
 * them for saying "per person".
 */
const PER_PERSON_ROW =
  /all[- ]you[- ]can[- ]eat|\bayce\b|prix[- ]fixe|omakase|tasting menu|churrasco|per\s+person|experience\b/i;

/** Sections where the unit of ordering is smaller than the unit of eating. */
const SHARE_SECTIONS =
  /taco|tapas|small plate|nigiri|sashimi|skewer|dim sum|yakitori|antojito|pincho|mezze|banchan|street (?:food|corn)|by the piece/i;

/**
 * How many entrées one person orders, by menu format. This is the judgment, and
 * it is deliberately coarse — the output is a band, so the difference between
 * 2.4 and 2.6 never reaches a screen.
 *
 * Nothing in the corpus scores these. Until Yelp's `price` field is fetched
 * they are hand-calibrated and unvalidated, and that is the argument for
 * fetching it: it is a crowd-sourced answer to this exact question, one API
 * parameter away, and it would turn these from guesses into a fit.
 */
const FORMAT_MULTIPLIERS = {
  perPerson: 1.0, // the menu already quotes a per-head price
  pizza: 1.1, // one pie is one dinner
  oneBowl: 1.2, // ramen, pho — the bowl is the meal
  standard: 1.2, // an entrée, and sometimes something alongside it
  combo: 1.3, // burger or sandwich, fries priced separately
  steakhouse: 1.5, // a steak plus its à la carte sides
  familyStyle: 1.6, // ordered to share, but you order more of them
  sushi: 2.5, // several rolls, or a lot of nigiri
  sharePlate: 3.0, // tacos, tapas — three or four make a meal
} as const;

type Format = keyof typeof FORMAT_MULTIPLIERS;

/** Below this many priced entrées, the median isn't describing a menu. */
const MIN_PRICED_ENTREES = 4;

/**
 * The share-plate signal is the fraction of entrée sections that look like
 * tacos/tapas/nigiri. Above the high mark it is a share-plate menu and every
 * entrée is scaled; below the low mark it is not and none are.
 *
 * Between them the menu is both — the Mexican restaurant with combo plates
 * *and* à la carte tacos. Picking a multiplier there would move it two bands on
 * a coin flip, so instead the share-plate sections are dropped and the band
 * comes from what is left, which is already a meal. Only when nothing is left
 * does that become a null.
 */
const MIXED_SHARE_LOW = 0.15;
const MIXED_SHARE_HIGH = 0.45;

/**
 * The fields banding reads. `name` is needed to spot bulk and per-person rows,
 * which are invisible in `section` alone. Widening this from two columns to
 * three costs nothing at read time — `db.ts` reads the stored `price_band`
 * column and never calls this; both callers are offline scripts.
 */
export type PricedItem = { name: string; price: string; section: string };

/** Median, not mean: one $36 filet on a $14 menu shouldn't move the band. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The first number in the string, not every digit concatenated. 225 rows in the
 * corpus carry a range — `"$13.99 - $29.99"` — and stripping non-digits turned
 * that into `"13.9929.99"`, which `parseFloat` reads as 13.9929. It never threw,
 * and it landed near the low end, so it went unnoticed; it was still arbitrary.
 */
function parsePrice(price: string): number | null {
  const match = /\d+(?:\.\d{1,2})?/.exec(price);
  if (!match) return null;
  const amount = Number.parseFloat(match[0]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * What kind of menu this is, and whether the share-plate sections should be
 * dropped before banding. `dropShareSections` is the mixed-menu case: the
 * format is `standard`, but only once the tacos are out of the pool.
 */
function formatFor(
  cuisine: string | undefined,
  sections: string[],
  perPersonRows: number,
): { format: Format; dropShareSections: boolean } {
  const keep = (format: Format) => ({ format, dropShareSections: false });

  // A menu quoting per-head prices is already the answer; never scale it.
  if (perPersonRows > 0) return keep("perPerson");

  const c = (cuisine ?? "").toLowerCase();

  // Cuisine is the stronger signal wherever it is unambiguous.
  if (c.includes("tapas") || c.includes("taco")) return keep("sharePlate");
  if (c.includes("sushi")) return keep("sushi");
  if (c.includes("steakhouse")) return keep("steakhouse");
  if (c.includes("dim sum") || c === "chinese") return keep("familyStyle");
  if (c.includes("ramen") || c.includes("pho") || c.includes("noodle")) return keep("oneBowl");
  if (c.includes("burger") || c.includes("sandwich") || c.includes("deli")) return keep("combo");
  if (c.includes("pizza")) return keep("pizza");

  const shareShare =
    sections.length > 0
      ? sections.filter((s) => SHARE_SECTIONS.test(s)).length / sections.length
      : 0;

  if (shareShare >= MIXED_SHARE_HIGH) return keep("sharePlate");
  if (shareShare > MIXED_SHARE_LOW) return { format: "standard", dropShareSections: true };
  return keep("standard");
}

export type SpendEstimate = {
  band: PriceBand;
  /** Estimated spend per person. Internal — band it, don't print it. */
  perPerson: number;
  /** The receipts: the entrée range this came from, for display beside the band. */
  entreeLow: number;
  entreeHigh: number;
  entreeMedian: number;
  format: Format;
};

/**
 * Null whenever there isn't enough menu to say — no priced entrées, too few of
 * them, or a format the menu itself doesn't settle.
 */
export function spendEstimate(
  dishes: readonly PricedItem[],
  cuisine?: string,
): SpendEstimate | null {
  const perPersonRows = dishes.filter((d) => PER_PERSON_ROW.test(d.name)).length;

  // Bulk rows are priced for a table. Per-person rows can look bulk ("per
  // person", "Churrasco Experience") but are exactly what we want, so they stay.
  const singles = dishes.filter(
    (d) => PER_PERSON_ROW.test(d.name) || !BULK_ROW.test(`${d.name} ${d.price}`),
  );

  const mains = singles.filter((d) => !SIDE_SECTIONS.test(d.section.trim()));
  const candidates = mains.length > 0 ? mains : singles;

  const { format, dropShareSections } = formatFor(
    cuisine,
    candidates.map((d) => d.section).filter(Boolean),
    perPersonRows,
  );

  // A mixed menu is banded on its full-size plates, with the tacos set aside.
  const pool = dropShareSections
    ? candidates.filter((d) => !SHARE_SECTIONS.test(d.section))
    : candidates;

  const prices = pool
    .map((d) => parsePrice(d.price))
    .filter((p): p is number => p !== null);
  if (prices.length < MIN_PRICED_ENTREES) return null;

  const entreeMedian = median(prices);
  const perPerson = entreeMedian * FORMAT_MULTIPLIERS[format];
  const sorted = [...prices].sort((a, b) => a - b);

  const band: PriceBand =
    perPerson < BAND_CUTS[0]
      ? "$"
      : perPerson < BAND_CUTS[1]
        ? "$$"
        : perPerson < BAND_CUTS[2]
          ? "$$$"
          : "$$$$";

  return {
    band,
    perPerson,
    entreeLow: sorted[0],
    entreeHigh: sorted[sorted.length - 1],
    entreeMedian,
    format,
  };
}

/** Null when there is not enough menu to price — an honest gap, not a "$". */
export function bandFor(
  dishes: readonly PricedItem[],
  cuisine?: string,
): PriceBand | null {
  return spendEstimate(dishes, cuisine)?.band ?? null;
}
