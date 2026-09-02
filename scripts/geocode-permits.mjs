/**
 * The 531 permits Google could not resolve, geocoded by the Census and
 * imported held.
 *
 *   node --env-file=.env.local scripts/geocode-permits.mjs            # dry, the default
 *   node --env-file=.env.local scripts/geocode-permits.mjs --apply
 *   node --env-file=.env.local scripts/geocode-permits.mjs --limit 50
 *
 * ## What this is for
 *
 * `resolve-places.mjs` asks Google "what business is at this address, called
 * something like this?" and 531 of 4,540 county permits came back with no
 * candidate that agreed on both the street number and the name. Those are not
 * failures of the county — the permit is a legal document and the business is
 * real — they are failures of a *search*, and they split three ways: places
 * whose sign says something the permit does not (JUANBERTOS, MINSOKCHON), the
 * genuinely obscure (a snack shack at a community centre), and institutional
 * kitchens nobody would browse a restaurant directory for.
 *
 * `import-deh.mjs` skips all of them, deliberately, because its whole design
 * rests on a Google place supplying the name, the pin and the type. Without one
 * there is no trade name to print and no coordinate to put on a map.
 *
 * The Census supplies the coordinate. It supplies nothing else, and that
 * asymmetry is the entire shape of this script.
 *
 * ## Why every row lands held
 *
 * A Census `Match`/`Exact` says *this address exists and here is its point on
 * the TIGER line file*. It does not say a business is there, does not say it is
 * open, and has never heard of the name. So the name on the row is the
 * county's legal name, cleaned — which is exactly the label
 * `import-deh.mjs`'s header argues a directory must never print, because
 * "SDCE FOOD SERVICES INC" is not what the sign says.
 *
 * That argument is why these rows carry `hold_reason` and not just
 * `listed = false`. `listed = false` means "not enriched yet"; it is the
 * normal state of a fresh import and an operator scrolling the table has no
 * reason to look twice at one. `hold_reason` means "a human has to decide
 * something about this row before it can ever be shown", and
 * `publish-check.mjs` treats it as a hard stop. The reason string names the
 * permit, so the decision can be made against the source:
 *
 *     permit-only: no public listing found (DEH DEH2002-FFPP-300203)
 *
 * `google_place_id` is NULL and `cuisine` is NULL for the same reason: both
 * would be guesses, and a wrong place id is worse than none — `import-deh.mjs`
 * treats a differing place id as a veto when deduping, so a fabricated one
 * would poison a future match.
 *
 * ## The institutional skip
 *
 * Two regexes, and they do different work. `INSTITUTIONAL_EXCLUDED` (from
 * `verify-coverage.mjs`) is the set where no Google primaryType could change
 * the answer — churches, VFW posts, jails, hospital cafeterias — and it was
 * already applied upstream, so it catches little here. `PERMIT_ONLY_EXCLUDED`
 * below is wider, and it is wider *because* this pass has no Google type to
 * fall back on. Upstream, "MT EMPIRE SENIOR NUTRITION" was allowed through on
 * the chance Google would return `restaurant`; Google returned nothing, and
 * without that check the only thing left is the word SENIOR. A senior nutrition
 * site, an American Legion post, a school cafeteria and a country club dining
 * room are all real permitted kitchens and none of them is a restaurant a
 * visitor can walk into, so on this pass the word decides.
 *
 * The skipped list is written to `data/deh-geocoded.json` like everything else.
 * Nothing is dropped silently; a name that should not have been skipped can be
 * found and re-run.
 *
 * ## The name, and the corpus as a dictionary
 *
 * The county shouts and drops apostrophes: MCDONALDS, ROBERTOS, JILBERTOS TACO
 * SHOP, SUBWAY #37012. Title-casing alone gives "Mcdonalds" and "Robertos",
 * which is worse than the shouting because it looks deliberate.
 *
 * The fix is that this repo already holds 8,126 correctly-spelled restaurant
 * names, ~700 of them chains. Normalise a corpus name the way the county writes
 * one (uppercase, apostrophes and store numbers gone) and it becomes a lookup
 * key: MCDONALDS -> "McDonald's", JILBERTOS TACO SHOP -> "Jilberto's Taco
 * Shop", PANDA EXPRESS -> "Panda Express". The dictionary is exact-match on
 * that key, so it only ever changes punctuation and case — it cannot rename a
 * business into a different one.
 *
 * Names the corpus has never seen fall through to title case plus one
 * possessive rule, and that rule is deliberately narrow. "Restore an
 * apostrophe before a possessive S" cannot be applied to any word ending in S
 * without turning WINGS into Wing's and TACOS into Taco's. So the S is only
 * restored when the stem is a *person's given name*, decided by a lexicon built
 * from the county's own `ownerName` column — 4,540 owner names, tokens seen
 * three times or more, minus the corporate vocabulary. ROBERTO, JILBERTO and
 * MARIA are in it; TACO, WING and PIZZA are not, because nobody is called that.
 * Plus the owner of this very permit, which catches the rare first name.
 *
 * ## The Census call, and the cache
 *
 * One free service, no key, 10,000 rows an upload:
 * https://geocoding.geo.census.gov/geocoder/locations/addressbatch, benchmark
 * `Public_AR_Current`, a POSTed CSV of `id,street,city,state,zip`.
 *
 * Every response line is appended to a cache under the scratch directory and an
 * id already answered is never submitted again — reruns of `--dry` while
 * tuning the name cleaner cost nothing and take a second. Two passes: the
 * permit's address verbatim, then, only for the ids the first pass could not
 * place, the address with the county's suite spellings removed ("635 W MISSION
 * AVE 33-34", "4620 CONVOY ST D", "1465 30TH (SB) ST"). The second pass is a
 * different question about the same permit, so it is cached separately.
 *
 * Only `Match` + `Exact` becomes a row. `Non_Exact` means the geocoder
 * substituted something — a different street type, a nearby number — and a
 * substituted address under a legal name with no Google confirmation is three
 * guesses stacked. Those go to a review list in the JSON and nowhere near the
 * table.
 */

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { INSTITUTIONAL_EXCLUDED, address as parseAddress, nameTokens, nameScore } from "./verify-coverage.mjs";
import { buildRow, cityFrom, cuisineFrom, idAllocator, insertRow } from "./deh-rows.mjs";

const RESOLVED_PATH = "data/deh-resolved.json";
const OUT_PATH = "data/deh-geocoded.json";

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const BENCHMARK = "Public_AR_Current";
/** The endpoint's documented ceiling. Nothing here comes near it. */
const BATCH_MAX = 10_000;

/**
 * The cache lives outside the repo on purpose: it is a transcript of one
 * external service's answers, it is regenerable, and `data/` is already
 * carrying the Google ledger. Override with --cache-dir for a throwaway run.
 */
const DEFAULT_CACHE_DIR =
  "C:/Users/CALVIN~1/AppData/Local/Temp/claude/deh/census";

function strFlag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
function numFlag(name, fallback) {
  const n = Number(strFlag(name, NaN));
  return Number.isFinite(n) ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = numFlag("limit", Infinity);
const CACHE_DIR = strFlag("cache-dir", DEFAULT_CACHE_DIR);
const FROM = strFlag("from", RESOLVED_PATH);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
if (!existsSync(FROM)) {
  console.error(`${FROM} is missing. Run resolve-places.mjs first.`);
  process.exit(1);
}

/* --- what to skip --------------------------------------------------------- */

/**
 * Wider than `INSTITUTIONAL_EXCLUDED`, and see the header for why: upstream a
 * borderline name was kept because a Google primaryType might still have said
 * `restaurant`. Here there is no primaryType, so the word is the whole
 * evidence.
 *
 *   POST / LODGE                fraternal and veterans' halls, members only
 *   CHURCH                      (already excluded upstream; kept for --from runs)
 *   HOSPITAL / HEALTH           clinical kitchens and cafeterias
 *   NUTRITION / SENIOR /
 *   DAY CENTER                  congregate meal sites, not open to walk-ins
 *   SCHOOL / ACADEMY /
 *   UNIVERSITY / COLLEGE        campus dining
 *   COUNTRY CLUB / FAIRGROUNDS  members or ticket holders
 *   SALVATION ARMY /
 *   COMMUNITY CENTER / YOUTH /
 *   CAMP                        charitable and civic feeding programmes
 *
 * \b on both ends throughout: CAMP does not match CAMPO (a real town with real
 * restaurants), HEALTH does not match HEALTHY.
 */
const PERMIT_ONLY_EXCLUDED =
  /\b(POST|LODGE|CHURCH|HOSPITAL|HEALTH|NUTRITION|DAY CENTER|SENIOR|SCHOOL|ACADEMY|UNIVERSITY|COLLEGE|COUNTRY CLUB|FAIRGROUNDS|SALVATION ARMY|COMMUNITY CENTER|YOUTH|CAMP)\b/i;

/* --- name cleaning -------------------------------------------------------- */

/** Store and branch numbers. "SUBWAY #37012", "SUBWAY # 6192", "CARLS JR # 147". */
const STORE_NUMBER = /\s*#\s*\d+[A-Z]?\b/g;
/** The same thing spelled without a hash: "PANDA EXPRESS NO 2431". */
const STORE_NUMBER_WORD = /\s+(?:NO|NUM|UNIT|STORE|STE)\.?\s*#?\s*\d+[A-Z]?\s*$/i;
/**
 * A bare trailing number long enough to be a store number and not part of the
 * name. Four digits, because three-digit trailing numbers in this data are
 * identifiers people use — "AERIE 244", "POST 282" — and five-figure store
 * numbers ("CHUCK E CHEESES 765" aside) all carry a hash anyway.
 */
const TRAILING_NUMBER = /\s+\d{4,}[A-Z]?\s*$/;
/** Corporate tails. Stripped repeatedly: "... FOOD SERVICES INC CO" happens. */
const CORPORATE_TAIL = /[\s,]+(INC|LLC|L\.?\s?L\.?\s?C|CORP|CORPORATION|LTD|LP|LLP|CO|DBA)\.?\s*$/i;

/**
 * Words that stay shouting through title case.
 *
 * Short and boring on purpose. "LA" is *not* here, and that is the interesting
 * omission: this county has La Mesa, La Jolla, La Costa and Las Palmas, and one
 * Los Angeles reference, so treating LA as an acronym would misspell four
 * places to fix none.
 */
const KEEP_UPPER = new Set([
  "BBQ", "BBQS", "KFC", "IHOP", "USA", "TV", "DJ", "ATM", "UTC", "VFW",
  "YMCA", "YWCA", "JR", "SR", "II", "III", "IV", "OB", "PB", "SD", "NYC",
  "MTS", "TGI", "BJS",
]);
/**
 * Words that go lowercase inside a name when they are not the first word.
 *
 * Names only. Street names take the other branch, where "N Harbor Dr" and "El
 * Cajon Blvd" have to keep their capitals — the first version of this ran one
 * title-caser over both and produced "4875 n Harbor Dr" and "1350 el Prado".
 */
const SMALL_WORDS = new Set([
  "a", "an", "and", "at", "by", "de", "del", "for", "in", "of", "on", "or",
  "the", "to", "y",
]);

function capitalise(w) {
  /* Capitalise after an apostrophe for O'Brien, not for Roberto's — the test is
     whether the apostrophe sits in the first two characters. */
  return w
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .replace(/[a-z]/g, (m, off) => (w[off - 1] === "'" && off <= 2 ? m.toUpperCase() : m));
}

/** "MAMAS BAKERY" -> "Mamas Bakery". Small words lowered, acronyms kept. */
function titleCaseName(raw) {
  return String(raw || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      const bare = w.replace(/[^a-z0-9]/g, "");
      if (bare.length > 1 && KEEP_UPPER.has(bare.toUpperCase())) return w.toUpperCase();
      if (/^\d+(st|nd|rd|th)\b/.test(w)) return w; /* 30th, not 30Th */
      /* A short mixed letter-and-digit token is a code, not a word: the terminal
         designator in "PHILS BBQ T2W" came out "T2w". */
      if (bare.length <= 4 && /\d/.test(bare) && /[a-z]/.test(bare)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(bare)) return w;
      return capitalise(w);
    })
    .join(" ");
}

/** "1465 30TH ST" -> "1465 30th St". Every word capitalised; ordinals excepted. */
function titleCaseStreet(raw) {
  return String(raw || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+(st|nd|rd|th)\b/.test(w) ? w : capitalise(w)))
    .join(" ");
}

/**
 * The county's spelling of a name, as a dictionary key.
 *
 * Uppercase, no apostrophes, no store number, no punctuation, single spaces.
 * Applied to both sides — a corpus name and a permit name — so equality means
 * "the same words, spelled differently".
 */
function nameKey(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(STORE_NUMBER, " ")
    .replace(/['’`.]/g, "")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * The apostrophe oracle: one word at a time, from the corpus.
 *
 * The whole-name dictionary above only fires when every word matches, and the
 * interesting failures are one word off — "JUANBERTOS" alone, "VALERIAS TACO
 * SHOP" where the corpus holds "Valeria's Taco Shop #2". So the corpus is
 * indexed a second time by *word*: how often each word appears possessive
 * ("McDonald's", "Jilberto's") and how often it appears plain ("Wings",
 * "Tacos", "Fries").
 *
 * That single comparison is the whole rule, and it is the one thing a
 * general "restore the apostrophe before a possessive S" heuristic cannot do:
 *
 *   MCDONALDS   possessive 104, plain   0  ->  McDonald's
 *   CARLS       possessive  57, plain   1  ->  Carl's
 *   JILBERTOS   possessive   4, plain   2  ->  Jilberto's
 *   WINGS       possessive   0, plain  39  ->  Wings
 *   PRETZELS    possessive   0, plain  18  ->  Pretzels
 *   VALERIES    possessive   3, plain   3  ->  Valeries   (a tie loses)
 *
 * The winning spelling is copied verbatim, so it carries the corpus's *casing*
 * too — "McDonald's", not the "Mcdonald's" that title-casing MCDONALDS gives.
 * A word the corpus has never written stays as the county wrote it. The rule
 * cannot invent a spelling; it can only repeat one a human already approved.
 *
 * Held rows are excluded from the index for the obvious reason: this script
 * writes held rows, and a second run must not learn its own guesses.
 */
function possessiveOracle(existingRows) {
  const poss = new Map();
  const plain = new Map();
  for (const r of existingRows) {
    if (r.hold_reason != null || !r.name) continue;
    for (const w of String(r.name).split(/[\s,]+/).filter(Boolean)) {
      const k = w
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[’`]/g, "'")
        .toUpperCase()
        .replace(/[^A-Z0-9']/g, "");
      const bare = k.replace(/'/g, "");
      if (bare.length < 3) continue;
      const target = /'S$/.test(k) ? poss : k.includes("'") ? null : plain;
      if (!target) continue;
      const seen = target.get(bare) ?? { n: 0, spellings: new Map() };
      seen.n += 1;
      seen.spellings.set(w, (seen.spellings.get(w) ?? 0) + 1);
      target.set(bare, seen);
    }
  }
  return {
    /** The corpus's preferred spelling of this word, possessive, or null. */
    possessiveSpelling(word) {
      const bare = word.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const p = poss.get(bare);
      if (!p) return null;
      /* Two sightings, not one. A single corpus row is one person's typing:
         "Rancho Villa's Mexican Food" is the only VILLAS in 7,683 names, and on
         its evidence alone this turned "MOUNTAIN VILLAS" into "Mountain
         Villa's". Undercorrecting prints the county's spelling; overcorrecting
         prints a wrong one confidently. */
      if (p.n < 2) return null;
      if ((plain.get(bare)?.n ?? 0) >= p.n) return null;
      return [...p.spellings].sort((a, b) => b[1] - a[1])[0][0];
    },
    size: poss.size,
  };
}

/**
 * Words the county uses as trade vocabulary, not as names.
 *
 * Counted over every permit's legal name: TACO appears standalone 142 times,
 * FOOD 177, KITCHEN 84, BURGER 37. A word that busy is a noun, whatever else it
 * may also be — and it is exactly the case where the owner-name fallback below
 * would go wrong, because "SAN DIEGO" in an owner's company name would
 * otherwise turn "DAN DIEGOS" into "Dan Diego's".
 */
function tradeWords(entries) {
  const counts = new Map();
  for (const e of entries) {
    for (const w of String(e.legalName || "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= 3).map(([w]) => w));
}

/**
 * ROBERTOS -> Roberto's, but WINGS stays Wings.
 *
 * Two rules, tried in order:
 *
 *  1. The corpus has written this word possessive more often than plain. Its
 *     spelling wins outright, casing included.
 *  2. The stem is a word in *this permit's own owner name* — "MARIA LUISAS
 *     PRODUCE" owned by Maria Luisa — and is not trade vocabulary. This is the
 *     only rule that can reach a name the corpus has never seen, and it is
 *     narrow because the evidence is thin: the permit says who owns it, and a
 *     possessive of the owner's name is the commonest sign in the county.
 *
 * "SS" endings are left alone — an English stem ending in S takes "es", so
 * BOSS is not BOS's — and stems under three letters are ignored.
 */
function restorePossessives(titled, oracle, trade, ownerName) {
  const owner = new Set(
    String(ownerName || "")
      .toUpperCase()
      .replace(/[^A-Z ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
  return titled
    .split(" ")
    .map((w) => {
      if (w.includes("'")) return w;
      const fromCorpus = oracle.possessiveSpelling(w);
      if (fromCorpus) return fromCorpus;
      const m = /^([A-Za-z]{3,})s$/.exec(w);
      if (!m) return w;
      const stem = m[1].toUpperCase();
      if (stem.endsWith("S")) return w;
      if (!owner.has(stem) || trade.has(stem)) return w;
      return `${m[1]}'s`;
    })
    .join(" ");
}

/**
 * The label that goes on the row.
 *
 * Order matters: the store number and corporate tail come off first so the
 * dictionary key is the bare brand ("SUBWAY #37012" -> SUBWAY), then the corpus
 * dictionary gets first refusal because a spelling a human already approved
 * beats any rule, then title case and the possessive rule handle the rest.
 */
function displayName(legalName, ownerName, dictionary, oracle, trade) {
  let s = String(legalName || "").replace(STORE_NUMBER, " ");
  s = s.replace(STORE_NUMBER_WORD, "").replace(TRAILING_NUMBER, "");
  let prev;
  do {
    prev = s;
    s = s.replace(CORPORATE_TAIL, "");
  } while (s !== prev);
  s = s.replace(/\s+/g, " ").trim();
  if (!s) s = String(legalName || "").replace(/\s+/g, " ").trim();

  const fromCorpus = dictionary.get(nameKey(s));
  if (fromCorpus) return { name: fromCorpus, via: "corpus" };

  const titled = titleCaseName(s);
  const withApostrophes = restorePossessives(titled, oracle, trade, ownerName);
  return { name: withApostrophes, via: withApostrophes === titled ? "titlecase" : "possessive" };
}

/* --- address cleaning ----------------------------------------------------- */

/**
 * The county writes suites as a bare trailing token, which the Census reads as
 * part of the street: "635 W MISSION AVE 33-34", "4620 CONVOY ST D",
 * "415 FLETCHER PKWY 931SPCT-17". It also parenthesises directional notes,
 * "1465 30TH (SB) ST".
 *
 * Only used for the second pass, on ids the verbatim address could not place —
 * removing a real address component is a way to get a confident match on the
 * wrong building, so it is a fallback, never the first question.
 */
const STREET_TYPE =
  /\b(ST|AVE|BLVD|RD|DR|WAY|PL|CT|LN|PKWY|HWY|HY|CIR|TER|TRL|LOOP|ROW|WALK|PATH|SQ|PLZ|EXPY|FWY|RTE|ALY|BND|XING|MALL|GRN|PARK|RANCHO|CAMINO|PASEO|VIA|CALLE|AVENIDA)\b/i;

/**
 * Street types that are followed by the road's *number*, not by a suite:
 * "HY 76", "HWY 78", "RTE 67". Everywhere else a trailing number is a unit.
 *
 * This distinction is what pass 2 got wrong on its first run: it refused to cut
 * any bare number after the street type, so "525 14TH ST 200" and "7877 GIRARD
 * AVE 301" went to the Census with their suite attached and came back
 * `Non_Exact`. Pass 3 exists because those answers are already cached under a
 * different question and this file does not re-ask one it has an answer to.
 */
const NUMBERED_ROUTE = /^(HWY|HY|HIGHWAY|RTE|ROUTE|FWY|EXPY|SR)$/i;

function cleanStreet(raw, { cutNumericTail = false } = {}) {
  let s = String(raw || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  /* Everything after the street type is a unit designator; the Census does not
     want it. Keep the street type itself. */
  const m = STREET_TYPE.exec(s);
  if (m) {
    const end = m.index + m[0].length;
    const tail = s.slice(end).trim();
    const numeric = /^\d+$/.test(tail);
    const routeNumber = numeric && NUMBERED_ROUTE.test(m[0]);
    if (!tail || (!routeNumber && (!numeric || cutNumericTail))) s = s.slice(0, end);
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Pass 3's rendering: pass 2 plus the county's two remaining spellings the
 * Census does not read.
 *
 *   "974 N COAST HY"  -> "974 N COAST HWY"   (HY is not a USPS abbreviation)
 *   "1201 01ST ST"    -> "1201 1ST ST"       (a zero-padded ordinal)
 */
function normaliseStreet(raw) {
  return cleanStreet(raw, { cutNumericTail: true })
    .replace(/\bHY\b/gi, "HWY")
    .replace(/\b0+(\d+(?:ST|ND|RD|TH)\b)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* --- the Census batch ----------------------------------------------------- */

function csvCell(v) {
  const s = String(v ?? "").replace(/"/g, "");
  return /[,]/.test(s) ? `"${s}"` : s;
}

/** Five columns, no header, one line per address. The id comes back verbatim. */
function toCsv(rows) {
  return rows.map((r) => [r.id, r.street, r.city, "CA", r.zip].map(csvCell).join(",")).join("\n") + "\n";
}

/**
 * The response is CSV with quoted fields and no header:
 *
 *   "id","input address","Match","Exact","matched address","lon,lat","tiger","side"
 *
 * A No_Match line stops after the third field, so the parser cannot assume a
 * column count.
 */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseResult(line) {
  const f = parseCsvLine(line);
  if (f.length < 3) return null;
  const [id, input, match, exactness, matched, coords] = f;
  if (match !== "Match") return { id, input, match, exactness: exactness ?? null };
  const [lngRaw, latRaw] = String(coords || "").split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { id, input, match: "No_Match", exactness: null, why: "unparseable coordinates" };
  }
  return { id, input, match, exactness, matched, lat, lng };
}

async function submitBatch(rows, cachePath, label) {
  if (!rows.length) return [];
  if (rows.length > BATCH_MAX) throw new Error(`${rows.length} rows exceeds the ${BATCH_MAX} batch ceiling`);
  const body = new FormData();
  body.set("benchmark", BENCHMARK);
  body.set("addressFile", new Blob([toCsv(rows)], { type: "text/csv" }), "addresses.csv");

  process.stdout.write(`  ${label}: submitting ${rows.length} addresses to the Census... `);
  const res = await fetch(ENDPOINT, { method: "POST", body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Census returned ${res.status}: ${text.slice(0, 200)}`);
  console.log("done");

  await mkdir(CACHE_DIR, { recursive: true });
  await appendFile(cachePath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map(parseResult).filter(Boolean);
}

async function loadCache(cachePath) {
  if (!existsSync(cachePath)) return new Map();
  const text = await readFile(cachePath, "utf8");
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const r = parseResult(line);
    if (r) map.set(r.id, r);
  }
  return map;
}

/* --- run ------------------------------------------------------------------ */

const sql = neon(process.env.DATABASE_URL);
const resolved = JSON.parse(await readFile(FROM, "utf8"));
const unmatched = resolved.filter((r) => r.status === "unmatched");

/* Counted over every permit, not just the unmatched ones: 4,540 legal names
   make a better trade vocabulary than 531. */
const trade = tradeWords(resolved);

const existing = await sql`
  SELECT id, source_key, sort_order, name, address, lat, lng, google_place_id, hold_reason
  FROM restaurants`;
const knownSourceKeys = new Set(existing.filter((r) => r.source_key).map((r) => r.source_key));

/* The corpus as a spelling dictionary. First writer of a key wins, and rows
   with a hold_reason are skipped — a held row's name may itself be an
   unreviewed legal name, and one of those must not teach the next. */
const dictionary = new Map();
for (const r of existing) {
  if (r.hold_reason != null || !r.name) continue;
  const k = nameKey(r.name);
  if (k.length >= 4 && !dictionary.has(k)) dictionary.set(k, r.name);
}
const oracle = possessiveOracle(existing);

/* --- 1. skip the institutions -------------------------------------------- */

const skippedInstitutional = [];
const eligible = [];
for (const e of unmatched) {
  const name = e.legalName ?? "";
  const hard = INSTITUTIONAL_EXCLUDED.test(name);
  const wide = PERMIT_ONLY_EXCLUDED.exec(name);
  if (hard || wide) {
    skippedInstitutional.push({
      sourceKey: e.sourceKey,
      recordId: e.recordId,
      legalName: name,
      address: `${e.address}, ${e.city} ${e.zip}`,
      outcome: "skipped-institutional",
      why: hard ? "INSTITUTIONAL_EXCLUDED" : `matched /\\b${wide[1].toUpperCase()}\\b/`,
    });
    continue;
  }
  eligible.push(e);
}

const alreadyPresent = eligible.filter((e) => knownSourceKeys.has(e.sourceKey));
const toGeocode = eligible
  .filter((e) => !knownSourceKeys.has(e.sourceKey))
  .slice(0, LIMIT === Infinity ? undefined : LIMIT);

/* --- 2. geocode ----------------------------------------------------------- */

const zip5 = (z) => String(z || "").trim().slice(0, 5);
const isExact = (r) => r && r.match === "Match" && r.exactness === "Exact";

/**
 * Three renderings of the same permit address, each with its own cache file.
 *
 * A pass runs for a permit only when every earlier pass failed to place it
 * exactly *and* this pass's rendering differs from all the earlier ones — the
 * same string would get the same answer, and asking twice is the one thing this
 * script is not allowed to do. Each file is a separate question, so an answer
 * already on disk is never re-asked even when the cleaners are edited: a new
 * cleaner gets a new pass and a new file rather than invalidating an old one.
 */
const PASSES = [
  { n: 1, label: "verbatim", file: `${CACHE_DIR}/pass1-verbatim.csv`, street: (e) => e.address.trim() },
  { n: 2, label: "suite removed", file: `${CACHE_DIR}/pass2-cleaned.csv`, street: (e) => cleanStreet(e.address) },
  { n: 3, label: "normalised", file: `${CACHE_DIR}/pass3-normalised.csv`, street: (e) => normaliseStreet(e.address) },
];

const answers = new Map(); /* recordId -> [{ pass, result }] */
const submitted = new Map(); /* recordId -> Set of street strings already asked */
let freshCount = 0;

for (const p of PASSES) {
  const cache = await loadCache(p.file);
  const pending = [];
  for (const e of toGeocode) {
    const asked = submitted.get(e.recordId) ?? new Set();
    if ((answers.get(e.recordId) ?? []).some((a) => isExact(a.result))) continue;
    const street = p.street(e);
    if (!street || asked.has(street)) continue;
    asked.add(street);
    submitted.set(e.recordId, asked);
    if (!cache.has(e.recordId)) pending.push({ id: e.recordId, street, city: e.city, zip: zip5(e.zip) });
  }
  const fresh = await submitBatch(pending, p.file, `pass ${p.n} (${p.label})`);
  freshCount += fresh.length;
  for (const r of fresh) cache.set(r.id, r);
  for (const e of toGeocode) {
    const r = cache.get(e.recordId);
    if (!r) continue;
    const seen = answers.get(e.recordId) ?? [];
    if (seen.some((a) => a.pass === p.n)) continue;
    seen.push({ pass: p.n, result: r });
    answers.set(e.recordId, seen);
  }
  p.pending = pending.length;
}

/** The best answer for a permit: the first exact one, else the first at all. */
function bestAnswer(recordId) {
  const seen = answers.get(recordId) ?? [];
  return seen.find((a) => isExact(a.result)) ?? seen[0] ?? null;
}

/* --- 3. rows -------------------------------------------------------------- */

/**
 * The Census hands back "1470 GARNET AVE, SAN DIEGO, CA, 92109" — four
 * comma-separated fields, all shouting. The column this repo displays looks
 * like Google's: "1470 Garnet Ave, San Diego, CA 92109".
 */
function formatMatchedAddress(matched) {
  const parts = String(matched || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 4) return titleCaseStreet(matched);
  const [street, city, state, zip] = parts;
  return `${titleCaseStreet(street)}, ${titleCaseStreet(city)}, ${state.toUpperCase()} ${zip}`;
}

const allocate = idAllocator(existing);
const holdReasonFor = (recordId) => `permit-only: no public listing found (DEH ${recordId})`;

const rows = [];
const nonExact = [];
const noMatch = [];

for (const e of toGeocode) {
  const answer = bestAnswer(e.recordId);
  const best = answer?.result ?? null;
  const pass = answer?.pass ?? null;

  const common = {
    sourceKey: e.sourceKey,
    recordId: e.recordId,
    legalName: e.legalName,
    permitAddress: `${e.address}, ${e.city} ${zip5(e.zip)}`,
  };

  if (!best) {
    noMatch.push({ ...common, outcome: "no-match", why: "no response line for this id" });
    continue;
  }
  if (!isExact(best)) {
    const entry = {
      ...common,
      outcome: best.match === "Match" ? "non-exact" : best.match === "Tie" ? "tie" : "no-match",
      censusMatch: best.match,
      censusExactness: best.exactness ?? null,
      matchedAddress: best.matched ?? null,
      pass,
    };
    if (entry.outcome === "no-match") noMatch.push(entry);
    else nonExact.push(entry);
    continue;
  }

  const formatted = formatMatchedAddress(best.matched);
  const { name, via } = displayName(e.legalName, e.ownerName, dictionary, oracle, trade);
  const row = buildRow(
    {
      sourceKey: e.sourceKey,
      dehRecordId: e.recordId,
      name,
      address: formatted,
      city: cityFrom(formatted, e.city),
      lat: best.lat,
      lng: best.lng,
      /* NULL, and see the header: a fabricated place id would veto a future
         real match in import-deh.mjs's dedupe. */
      googlePlaceId: null,
      holdReason: holdReasonFor(e.recordId),
      /* NULL: there is no Google type here, and the county's businessType says
         "Restaurant Food Facility" for a taqueria and a banquet kitchen alike. */
      ...cuisineFrom(null),
    },
    allocate,
  );
  rows.push({ ...row, legalName: e.legalName, nameVia: via, censusPass: pass, matchedAddress: best.matched });
}

/* --- 4. the near-duplicate signal ----------------------------------------- */

/**
 * Not a filter — the brief for this pass is source_key dedupe and nothing else,
 * and every row lands held where an operator sees it. But a held row sitting on
 * top of a listed one is the single most useful thing to hand that operator, so
 * it is counted and named in the JSON.
 *
 * Same test import-deh.mjs uses, minus the place-id veto (these have none):
 * within 150 m and a name score of 0.8 or better.
 */
const MATCH_METRES = 150;
const NAME_CONFIDENT = 0.8;
function metresBetween(a, b) {
  const latRad = (a.lat * Math.PI) / 180;
  return Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * Math.cos(latRad));
}
const nearby = existing
  .filter((r) => r.lat != null && r.lng != null && r.hold_reason == null)
  .map((r) => ({ ...r, tokens: nameTokens(r.name), ...parseAddress(r.address) }));
const grid = new Map();
const cell = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
for (const r of nearby) {
  for (const dLat of [-0.01, 0, 0.01]) {
    for (const dLng of [-0.01, 0, 0.01]) {
      const k = cell(r.lat + dLat, r.lng + dLng);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(r);
    }
  }
}
for (const row of rows) {
  const tokens = nameTokens(row.name);
  let hit = null;
  for (const r of grid.get(cell(row.lat, row.lng)) ?? []) {
    const metres = metresBetween(row, r);
    if (metres > MATCH_METRES) continue;
    const score = nameScore(tokens, r.tokens);
    if (score < NAME_CONFIDENT) continue;
    if (!hit || metres < hit.metres) hit = { id: r.id, name: r.name, metres: Math.round(metres), score };
  }
  if (hit) row.possibleDuplicateOf = hit;
}

/* --- 5. report ------------------------------------------------------------ */

const pad = (n) => String(n).padStart(6);
console.log(`\nread ${resolved.length} resolved permits from ${FROM}\n`);
console.log(`  ${pad(unmatched.length)}  unmatched (this script's input)`);
console.log(`  ${pad(skippedInstitutional.length)}  skipped, institutional`);
console.log(`  ${pad(eligible.length)}  eligible`);
if (alreadyPresent.length) {
  console.log(`  ${pad(alreadyPresent.length)}  already in the table by source_key, not resubmitted`);
}
console.log(`  ${pad(toGeocode.length)}  put to the Census (${freshCount} new answers this run; ` +
  `${PASSES.map((p) => `pass ${p.n} ${p.pending}`).join(", ")})`);
console.log(`  ${pad(rows.length)}  Match + Exact -> rows`);
console.log(`  ${pad(nonExact.length)}  Non_Exact or Tie -> review list, not written`);
console.log(`  ${pad(noMatch.length)}  No_Match`);

const viaCounts = rows.reduce((m, r) => ({ ...m, [r.nameVia]: (m[r.nameVia] ?? 0) + 1 }), {});
console.log(`\nnames: ${viaCounts.corpus ?? 0} from the corpus dictionary, ` +
  `${viaCounts.possessive ?? 0} title-cased with an apostrophe restored, ` +
  `${viaCounts.titlecase ?? 0} title-cased as-is`);
console.log(`apostrophe oracle: ${oracle.size} possessive words indexed from ${dictionary.size} corpus names; ` +
  `${trade.size} trade words counted from ${resolved.length} legal names`);
for (const p of PASSES.slice(1)) {
  const n = rows.filter((r) => r.censusPass === p.n).length;
  console.log(`${n} of the ${rows.length} rows needed pass ${p.n} (${p.label})`);
}
const dupes = rows.filter((r) => r.possibleDuplicateOf);
console.log(`${dupes.length} rows sit within ${MATCH_METRES} m of an existing row with a name score >= ${NAME_CONFIDENT} (flagged in ${OUT_PATH}, still written, still held)`);

console.log(`\nids that would be assigned: ${rows.length ? `${rows[0].id}..${rows[rows.length - 1].id}` : "none"}`);
console.log(`every row: listed = false, google_place_id NULL, cuisine NULL, hold_reason set.`);

if (rows.length) {
  console.log(`\nfirst ${Math.min(15, rows.length)} rows:\n`);
  for (const r of rows.slice(0, 15)) {
    console.log(`  id ${r.id}  ${r.name}   [county: ${r.legalName}]`);
    console.log(`     ${r.address}`);
    console.log(`     ${r.neighborhood}  ${r.lat.toFixed(5)},${r.lng.toFixed(5)}  (name via ${r.nameVia}, census pass ${r.censusPass})`);
    console.log(`     ${r.holdReason}`);
    if (r.possibleDuplicateOf) {
      console.log(`     ! ${r.possibleDuplicateOf.metres} m from id ${r.possibleDuplicateOf.id} "${r.possibleDuplicateOf.name}" (score ${r.possibleDuplicateOf.score.toFixed(2)})`);
    }
  }
}

/* --- 6. the outcome file -------------------------------------------------- */

const outcomes = [
  ...skippedInstitutional,
  ...alreadyPresent.map((e) => ({
    sourceKey: e.sourceKey,
    recordId: e.recordId,
    legalName: e.legalName,
    outcome: "already-in-table",
  })),
  ...rows.map((r) => ({
    sourceKey: r.sourceKey,
    recordId: r.dehRecordId,
    legalName: r.legalName,
    outcome: "geocoded-exact",
    id: r.id,
    name: r.name,
    nameVia: r.nameVia,
    address: r.address,
    city: r.city,
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    censusPass: r.censusPass,
    matchedAddress: r.matchedAddress,
    holdReason: r.holdReason,
    possibleDuplicateOf: r.possibleDuplicateOf ?? null,
  })),
  ...nonExact,
  ...noMatch,
];
await writeFile(OUT_PATH, `${JSON.stringify(outcomes, null, 1)}\n`, "utf8");
console.log(`\nwrote ${outcomes.length} outcomes to ${OUT_PATH} (every input row appears exactly once).`);

if (!APPLY) {
  console.log(`\nDry run — nothing written to the database. Re-run with --apply to insert.`);
  process.exit(0);
}

/* --- 7. write ------------------------------------------------------------- */

const verifiedAt = new Date().toISOString();
for (const [i, r] of rows.entries()) {
  /* "nothing", not "update": a row already under this source key was written by
     a better-informed pass, and a Census centroid must not overwrite it. */
  await insertRow(sql, r, verifiedAt, { onConflict: "nothing" });
  if (i % 25 === 0) process.stdout.write(`\r  inserting ${i}/${rows.length}`);
}
console.log(`\r  inserting ${rows.length}/${rows.length}`);

const [{ count: held }] = await sql`
  SELECT COUNT(*)::int AS count FROM restaurants WHERE hold_reason LIKE 'permit-only%'`;
const [{ count: total }] = await sql`SELECT COUNT(*)::int AS count FROM restaurants`;
console.log(`\ninserted ${rows.length} rows. ${held} rows now carry a permit-only hold_reason; ${total} rows in the table.`);
console.log(`Reverse with: DELETE FROM restaurants WHERE hold_reason LIKE 'permit-only%' AND source_key LIKE 'deh:%';`);
