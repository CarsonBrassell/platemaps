/**
 * The content filter: what a post, comment or username is not allowed to say.
 *
 * Pure — no database, no network — so both the API routes that enforce it and
 * any client that wants to warn early can import it, and so it can be reasoned
 * about without a running app.
 *
 * ## Two tiers, because they deserve different answers
 *
 * - **`block`** — slurs. The write is refused outright. There is no version of
 *   a plate review that needs one, so there is nothing to weigh against.
 * - **`review`** — ordinary profanity. It is **allowed through** and reported
 *   as flagged. A review that calls a sandwich shit is a real opinion about a
 *   sandwich, and a filter that swallows it makes the product worse at its
 *   actual job. Flagging gives a human the option without taking the post.
 *
 * ## Why matching tolerates repeats instead of collapsing them
 *
 * The first version of this file collapsed runs of a letter during
 * normalization (`niiigger` -> `niger`) and stored the list pre-collapsed.
 * That is wrong twice over, and both failures were caught by running it:
 *
 * - It **destroys** short terms. `gook` collapses to `gok` and `coon` to
 *   `con`, so neither matched its own list entry any more.
 * - Worse, the repair is a trap: storing the collapsed `con` would then block
 *   every legitimate "con" a person ever typed.
 *
 * So normalization leaves letters alone and the *pattern* absorbs the repeats
 * — each character is allowed to repeat (`c+o+o+n+`). `coon` and `cooooon`
 * both match; `con` cannot, because two separate `o+` groups need two runs of
 * o. The list stays in natural spelling, which is also what makes it safe for
 * someone else to extend.
 *
 * ## The Scunthorpe rule
 *
 * The classic failure of every naive wordlist is matching inside a longer,
 * innocent word, and this app is about *food*, which makes that concrete
 * rather than theoretical: a substring matcher eats "Scunthorpe", "shiitake",
 * "cockles", "assorted" and — the one that would really hurt — "spicy". Every
 * term matches on **word boundaries only**. The cases in `MODERATION_CASES`
 * below are the regression list; they are exported so a script can run them.
 *
 * ## The evasion rule, and its limits
 *
 * `normalize` folds the cheap dodges: case, accents, leetspeak digits, and
 * separators pushed between letters (`n-i-g-g-a`, `n.i.g.g.a`) — those simply
 * cease to exist. Combined with repeat tolerance that covers what a person
 * types in anger on a phone.
 *
 * **It is not complete and must not be sold as complete.** A determined poster
 * gets around any wordlist. This is the floor, not the ceiling: reporting,
 * blocking, and a human able to remove a post are what actually moderate a
 * community. A wordlist is the part that works while nobody is looking.
 */

export type ModerationVerdict =
  | { action: "allow" }
  | { action: "review"; matched: string[] }
  | { action: "block"; matched: string[] };

/**
 * Slurs. Refused outright, in natural spelling.
 *
 * **Both endings of the racial slur are listed.** The -a form is claimed by
 * some speakers as reclaimed usage; that argument turns on who is speaking and
 * to whom, and a restaurant review has no way to know either. In a product
 * whose entire corpus is opinions about food, blocking both costs nothing real.
 */
const BLOCK_TERMS: readonly string[] = [
  "nigger",
  "nigga",
  "chink",
  "gook",
  "spic",
  "wetback",
  "kike",
  "coon",
  "beaner",
  "faggot",
  "fag",
  "tranny",
  "trannies",
  "dyke",
  "retard",
  "retarded",
];

/**
 * Ordinary profanity. Allowed through, reported as flagged.
 *
 * Short and unglamorous on purpose — this exists so someone can *see* what is
 * being said, not to sanitise a review.
 */
const REVIEW_TERMS: readonly string[] = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "bastard",
  "dick",
  "piss",
];

/**
 * Suffixes a review-tier term may carry and still count.
 *
 * Deliberately a short closed set rather than `\w*`: "fucking" should flag,
 * but `shit\w*` would match the normalized "shiitake" and take a mushroom
 * off the menu. Nothing in this set turns a listed term into a real word.
 */
const SUFFIXES = ["", "s", "ed", "er", "ers", "ing", "y"];

/** Leetspeak and lookalike folding, applied character by character. */
const CHAR_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

/**
 * Folds text to the form the term patterns are matched against.
 *
 * Lowercases, strips diacritics, maps leetspeak, then drops everything that is
 * not a letter or a space. That last step is what defeats `n-i-g-g-a` and
 * `n.i.g.g.a`. Runs of a letter are **left intact** — see the header for why
 * collapsing them was wrong.
 *
 * The cost worth naming: dropping punctuation welds hyphenated words together,
 * so `well-known` becomes `wellknown`. That is harmless here because matching
 * is word-boundary-anchored against a list on which no entry is a fragment
 * that could appear inside a welded pair.
 */
export function normalize(input: string, separatorsAsSpace = false): string {
  const folded = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  let out = "";
  for (const ch of folded) {
    const mapped = CHAR_MAP[ch] ?? ch;
    if (/[a-z]/.test(mapped)) out += mapped;
    else if (/\s/.test(ch)) out += " ";
    else if (separatorsAsSpace) out += " ";
    // Otherwise punctuation, emoji and separators are dropped entirely.
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Both foldings of the same text, because neither alone is enough.
 *
 * This is not belt-and-braces — each catches an evasion the other cannot, and
 * a real signup got through while only the first existed:
 *
 * - **Separators dropped** catches `n-i-g-g-a`, where the punctuation is
 *   *inside* the word. Folding those to spaces would scatter it into single
 *   letters and match nothing.
 * - **Separators as spaces** catches `n1gg3r_fan`, where the punctuation
 *   *delimits* words. Dropping it welds the pair into `niggerfan`, and the
 *   word-boundary anchor then refuses to match — which is exactly how that
 *   username created an account in testing.
 *
 * Usernames are the case that makes the second one mandatory, since `_` is one
 * of the three characters `USERNAME_PATTERN` allows.
 */
function foldings(input: string): [string, string] {
  return [normalize(input), normalize(input, true)];
}

/**
 * Builds the repeat-tolerant, boundary-anchored pattern for one term.
 *
 * `coon` becomes `\bc+o+o+n+\b`, which matches "coon" and "cooooon" but not
 * "con" — two `o+` groups require two separate runs of o.
 *
 * Compiled once at module load rather than per call: these are hot paths on
 * every write, and `RegExp` construction is the expensive part.
 */
function patternFor(term: string, suffixes: readonly string[]): RegExp {
  const body = term
    .split("")
    .map((c) => `${c}+`)
    .join("");
  const tail = suffixes.filter(Boolean).join("|");
  const ending = tail ? `(?:${tail})?` : "";
  return new RegExp(`\\b${body}${ending}\\b`);
}

const BLOCK_PATTERNS = BLOCK_TERMS.map((t) => [t, patternFor(t, [""])] as const);
const REVIEW_PATTERNS = REVIEW_TERMS.map((t) => [t, patternFor(t, SUFFIXES)] as const);

/**
 * Checks one piece of user text.
 *
 * `block` wins over `review` — text carrying both is refused, not flagged.
 */
export function moderateText(input: string): ModerationVerdict {
  if (!input) return { action: "allow" };
  const forms = foldings(input).filter(Boolean);
  if (forms.length === 0) return { action: "allow" };

  const hits = (patterns: ReadonlyArray<readonly [string, RegExp]>) =>
    patterns.filter(([, re]) => forms.some((form) => re.test(form))).map(([t]) => t);

  const blocked = hits(BLOCK_PATTERNS);
  if (blocked.length > 0) return { action: "block", matched: blocked };

  const flagged = hits(REVIEW_PATTERNS);
  if (flagged.length > 0) return { action: "review", matched: flagged };

  return { action: "allow" };
}

/**
 * What a blocked writer is told.
 *
 * It does not name the term it matched, for two reasons: quoting a slur back
 * at someone is its own harm, and an error naming the exact string that tripped
 * is a free oracle for probing the list.
 */
export const BLOCKED_MESSAGE =
  "That language isn't allowed on PlateMaps. Edit it and try again.";

/**
 * A username is held to **both** tiers.
 *
 * A handle is not a one-off sentence — it is printed on every post, comment and
 * leaderboard row its owner ever touches, so ordinary profanity that is fine
 * inside a review is not fine as a name.
 */
export function moderateUsername(input: string): ModerationVerdict {
  const verdict = moderateText(input);
  if (verdict.action === "review") {
    return { action: "block", matched: verdict.matched };
  }
  return verdict;
}

/**
 * The regression list, exported so `npm run moderation:check` can assert it.
 *
 * The `allow` half is the important half. Blocking a slur is easy; not eating
 * "spicy" is the part that breaks silently and that nobody notices until a
 * real review disappears.
 */
export const MODERATION_CASES: ReadonlyArray<{
  text: string;
  expect: ModerationVerdict["action"];
}> = [
  // Must never be touched — the Scunthorpe set, food edition.
  { text: "shiitake mushrooms", expect: "allow" },
  { text: "spicy pho ga", expect: "allow" },
  { text: "assorted cockles", expect: "allow" },
  { text: "best in Scunthorpe", expect: "allow" },
  { text: "raccoon on the patio", expect: "allow" },
  { text: "the con is the wait", expect: "allow" },
  { text: "bass was overcooked", expect: "allow" },
  { text: "a classic dish", expect: "allow" },
  { text: "analog vibes", expect: "allow" },
  { text: "titanic portions", expect: "allow" },
  { text: "spicy_pho_fan", expect: "allow" },
  { text: "well-known classic", expect: "allow" },
  // Slurs, plain and evaded.
  { text: "nigger", expect: "block" },
  { text: "nigga", expect: "block" },
  { text: "n-i-g-g-a", expect: "block" },
  { text: "N1GG3R", expect: "block" },
  { text: "niiiggggaaa", expect: "block" },
  { text: "gook", expect: "block" },
  { text: "coon", expect: "block" },
  { text: "f4ggot", expect: "block" },
  // The separator-delimited form. `n1gg3r_fan` created an account before
  // `foldings` existed — the underscore welded the pair and the word boundary
  // then refused to match.
  { text: "n1gg3r_fan", expect: "block" },
  { text: "xX_nigga_Xx", expect: "block" },
  { text: "coon.lover", expect: "block" },
  { text: "that is retarded", expect: "block" },
  // Profanity: allowed through, flagged.
  { text: "this fucking rules", expect: "review" },
  { text: "the fries were shit", expect: "review" },
  { text: "solid burger", expect: "allow" },
];
