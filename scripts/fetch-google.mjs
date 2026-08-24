/**
 * One Google Places call per restaurant, closing four columns at once.
 *
 *   node --env-file=.env.local scripts/fetch-google.mjs --dry
 *   node --env-file=.env.local scripts/fetch-google.mjs --max-calls 50
 *   node --env-file=.env.local scripts/fetch-google.mjs --no-photos
 *
 * ## Why this exists alongside fetch-yelp.mjs
 *
 * Yelp gives a photo and a rating for 300 restaurants a day and nothing else -
 * its search response carries no hours, so those need a second call to a
 * different endpoint, which queues behind the first. At 5,672 restaurants that
 * is about four weeks for photos and hours together.
 *
 * One Google `searchText` call returns rating, review count, opening hours,
 * website, formatted address and photo references in a single response. Four
 * of the five things the readiness gate and the product need, per request, with
 * no 300-a-day ceiling.
 *
 * It is not free, which is the whole reason for the accounting below.
 *
 * ## Money
 *
 * Every field this asks for is on Google's **Enterprise** Text Search SKU:
 * $35 per 1,000 calls, with 1,000 free per month. Photo media fetches are a
 * separate SKU at $7 per 1,000, also 1,000 free monthly. So a fully enriched
 * restaurant costs about 4.2 cents.
 *
 * The account is currently on a 90-day $300 trial credit, and Google cannot
 * charge a card while a trial is active - only an explicit upgrade does that.
 * That is the real protection. This script adds two more:
 *
 *  - MONTHLY_CEILING, checked against calls already made this billing month,
 *    counted from `google_checked_at` rather than a ledger that could drift.
 *  - `--max-calls`, a per-run cap, defaulting low.
 *
 * It prints the running cost every time. A script that spends money silently
 * is a script nobody can supervise.
 */

import { neon } from "@neondatabase/serverless";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/*
 * Every field here is Enterprise-tier. Asking for even one of them bills the
 * whole call at Enterprise rates, so there is no saving in trimming the list -
 * and every one of these closes a column the site is waiting on.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.formattedAddress",
  "places.addressComponents",
  "places.photos",
  "places.businessStatus",
].join(",");

/** Per calendar month, across every run. Google's free allowance is 1,000. */
const MONTHLY_CEILING = Number(process.env.GOOGLE_MONTHLY_CEILING ?? 1000);
const COST_PER_SEARCH = 0.035;
const COST_PER_PHOTO = 0.007;

/** How far a Google result may sit from our coordinates and still be the same place. */
const MAX_MATCH_METRES = 300;
/** Below this, the name match is too weak to trust. */
const MIN_SIMILARITY = 0.55;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const MAX_CALLS = flag("max-calls", 50);
const DRY_RUN = process.argv.includes("--dry");
const NO_PHOTOS = process.argv.includes("--no-photos");
/** Work the restaurants that have no photo before the ones that do. */
const PHOTOS_FIRST = process.argv.includes("--photos-first");

const apiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_PLACES_API_KEY is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Re-run with --env-file=.env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let searchCalls = 0;
let photoCalls = 0;
class StopRun extends Error {}

/* --- Matching (shared shape with fetch-yelp.mjs) -------------------------- */

function normalize(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Apostrophes are deleted rather than spaced, so a possessive stays one
    // word. Spacing them split "Phil's" into "phil" + "s", which then failed to
    // match Google's "Phils BBQ Point Loma" on any whole token.
    .replace(/['‘’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  const [x, y] = [normalize(a), normalize(b)];
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  if (longer.includes(shorter) && shorter.length >= 4) return 0.9;

  const bigrams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const [bx, by] = [bigrams(x), bigrams(y)];
  let shared = 0;
  for (const [g, count] of bx) shared += Math.min(count, by.get(g) ?? 0);
  const total =
    [...bx.values()].reduce((n, c) => n + c, 0) + [...by.values()].reduce((n, c) => n + c, 0);
  return total === 0 ? 0 : (2 * shared) / total;
}

function metresBetween(a, b) {
  const latRad = (a.lat * Math.PI) / 180;
  return Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * Math.cos(latRad));
}

/*
 * Words that carry no identity. Two restaurants sharing "kitchen" or "grill"
 * tells you nothing; two sharing "sipz" is the same restaurant.
 */
const GENERIC = new Set([
  // Venue types
  "cafe", "caffe", "bar", "grill", "grille", "restaurant", "kitchen", "house",
  "pub", "tavern", "eatery", "bistro", "lounge", "diner", "shop", "saloon",
  "cantina", "taqueria", "trattoria", "osteria", "brewery", "brewing", "club",
  "market", "cocina", "steakhouse", "buffet", "express", "room",
  // Food words — "Benny's Mexican Food" and "Chiquita's Mexican Food" are two
  // restaurants two blocks apart, and cuisine is exactly what they share.
  "food", "foods", "pizza", "pizzeria", "sushi", "taco", "tacos", "bbq", "deli",
  "bakery", "coffee", "mexican", "italian", "chinese", "thai", "japanese",
  "indian", "seafood", "burger", "burgers", "chicken", "noodle", "noodles",
  "ramen", "mariscos", "asian", "american", "mediterranean", "greek", "korean",
  "vietnamese", "sandwich", "sandwiches", "wings", "grillhouse",
  // Filler
  "the", "and", "san", "diego", "co", "company", "inc", "llc", "of", "at", "on", "by",
]);

/**
 * A rare word both names share.
 *
 * Bigram similarity is the wrong tool when a business appends its location and
 * drops a word: our "Sipz Fusion Cafe" against Google's "Sipz Clairemont"
 * scores 0.27 and was rejected — two metres apart. The distinctive token
 * "sipz" is the whole signal, and it survives any amount of surrounding
 * rewording.
 *
 * Generic words are excluded because a strip mall holds five places sharing
 * "grill", and four characters is the floor because shorter tokens collide by
 * accident.
 */
function sharesDistinctiveToken(a, b) {
  const tokens = (s) =>
    new Set(normalize(s).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w)));
  const [ta, tb] = [tokens(a), tokens(b)];
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

/* --- Hours ---------------------------------------------------------------- */

/**
 * Google's `regularOpeningHours.periods` into the shape the site stores.
 *
 * Google numbers days 0 = Sunday; everything here is stored 0 = Monday, the
 * convention fetch-hours.mjs established from Yelp. Converting on the way in
 * keeps one convention in the database rather than two that can disagree.
 */
function hoursFrom(regular) {
  const periods = regular?.periods;
  if (!periods?.length) return null;

  const slots = [];
  for (const p of periods) {
    if (!p.open) continue;
    // A 24-hour place has an open with no close.
    if (!p.close) {
      slots.push({ day: (p.open.day + 6) % 7, start: "0000", end: "2359" });
      continue;
    }
    const pad = (h, m) => `${String(h).padStart(2, "0")}${String(m ?? 0).padStart(2, "0")}`;
    const start = pad(p.open.hour, p.open.minute);
    const end = pad(p.close.hour, p.close.minute);
    slots.push({
      day: (p.open.day + 6) % 7,
      start,
      end,
      ...(p.close.day !== p.open.day ? { overnight: true } : {}),
    });
  }
  return slots.length > 0 ? slots : null;
}

/* --- Photos --------------------------------------------------------------- */

/**
 * A displayable image URL for a photo reference.
 *
 * `skipHttpRedirect` matters more than it looks. Without it the endpoint 302s
 * to the image, so the only URL we could store would be the request URL - which
 * contains the API key, and would then be served to every visitor in the page
 * source. With it, Google answers with JSON containing a `photoUri` on
 * googleusercontent.com that needs no key.
 *
 * Billed as a separate SKU, so it is counted separately and can be skipped
 * entirely with --no-photos.
 */
async function photoUriFor(photoName) {
  if (photoCalls + searchCalls >= MAX_CALLS) throw new StopRun("--max-calls reached");
  photoCalls += 1;
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxWidthPx=1200&skipHttpRedirect=true&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return (await res.json()).photoUri ?? null;
}

/* --- Search --------------------------------------------------------------- */

async function findOnGoogle(r) {
  if (searchCalls + photoCalls >= MAX_CALLS) throw new StopRun("--max-calls reached");
  searchCalls += 1;

  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${r.name} ${r.neighborhood} San Diego`,
      // Biasing on our own coordinates is what stops a chain matching the wrong
      // branch twenty miles away.
      locationBias: { circle: { center: { latitude: r.lat, longitude: r.lng }, radius: 500 } },
      maxResultCount: 5,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 429) throw new StopRun("Google returned 429 (quota spent)");
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const { places = [] } = await res.json();

  /*
   * Distance does most of the work here, and that is deliberate.
   *
   * Every candidate has already survived a 300m filter around coordinates we
   * hold for the restaurant, so the question is no longer "is this the right
   * neighbourhood" but "is this the unit next door". At that range a shared
   * distinctive token is enough — requiring the bigram score as well threw out
   * "Sipz Clairemont" as a match for "Sipz Fusion Cafe" from two metres away.
   *
   * Closest wins among the acceptable, rather than best-named: two restaurants
   * that both clear the name test within 300m are a strip mall, and the one
   * standing on our coordinates is the one we meant.
   */
  let best = null;
  for (const p of places) {
    if (!p.location) continue;
    const distance = metresBetween(r, { lat: p.location.latitude, lng: p.location.longitude });
    if (distance > MAX_MATCH_METRES) continue;

    const title = p.displayName?.text ?? "";
    const acceptable =
      similarity(r.name, title) >= MIN_SIMILARITY || sharesDistinctiveToken(r.name, title);
    if (!acceptable) continue;

    if (!best || distance < best.distance) best = { distance, place: p };
  }
  return best?.place ?? null;
}

/* --- Run ------------------------------------------------------------------ */

const [{ used }] = await sql`
  SELECT count(*)::int AS used FROM restaurants
  WHERE date_trunc('month', google_checked_at) = date_trunc('month', now())
`;
const remaining = MONTHLY_CEILING - used;

/*
 * Ordered by how well known the restaurant is, NOT by what it is missing.
 *
 * The first version put photo-less restaurants first, on the theory that they
 * needed enrichment most. That aimed Google at exactly the rows Yelp had
 * already failed to match — obscure bars and businesses that no longer exist,
 * measured at 22-30% permanently closed — and returned a 15% match rate that
 * looked like a broken matcher. The same matcher scores 10/10 against
 * well-known restaurants, every hit inside 47 metres.
 *
 * So: work the corpus in value order. Google fills the Google rating, hours and
 * address for restaurants people actually search for, and picks up a photo
 * wherever one is missing on the way past. The dead tail arrives last, which is
 * where it belongs — and every closure Google confirms there removes a row from
 * the queue permanently, which is worth something too.
 */
const targets = await sql`
  SELECT id, name, neighborhood, lat, lng, (photo IS NULL) AS needs_photo
  FROM restaurants
  WHERE hold_reason IS NULL
    AND lat IS NOT NULL AND lng IS NOT NULL
    AND google_checked_at IS NULL
  ORDER BY
    -- --photos-first aims the run at what is blocking publication rather than
    -- at what is well known. Those two orders want opposite things: the
    -- best-reviewed restaurants already have Yelp photos, so a value-ordered
    -- run fills ratings and addresses and unblocks nobody, while a
    -- photo-ordered run works the cohort Yelp could not match - lower match
    -- rate, more confirmed closures, and every hit puts a restaurant on the
    -- site.
    CASE WHEN ${PHOTOS_FIRST} THEN (photo IS NOT NULL) END,
    review_count DESC NULLS LAST, id::int
`;

console.log(
  `${used} Google lookups already made this billing month (ceiling ${MONTHLY_CEILING}).\n` +
    `${targets.length} restaurants never looked up.\n`,
);

if (remaining <= 0) {
  console.log(
    `Monthly ceiling reached. Nothing will be spent.\n` +
      `Raise it deliberately with GOOGLE_MONTHLY_CEILING if that is what you want.`,
  );
  process.exit(0);
}

const plan = Math.min(targets.length, MAX_CALLS, remaining);
const photoPlan = NO_PHOTOS ? 0 : targets.slice(0, plan).filter((t) => t.needs_photo).length;
const estimate = plan * COST_PER_SEARCH + photoPlan * COST_PER_PHOTO;
console.log(
  `This run: at most ${plan} restaurants, ${photoPlan} of which need a photo.\n` +
    `Estimated cost if nothing were free: $${estimate.toFixed(2)}. ` +
    `Google's first 1,000 of each SKU per month are free.\n`,
);

if (DRY_RUN) {
  console.log("Dry run - no calls made, nothing written, nothing spent.");
  process.exit(0);
}

let matched = 0;
let missed = 0;
let closed = 0;
let photos = 0;
let stopped = null;

for (const [i, r] of targets.entries()) {
  if (searchCalls + photoCalls >= MAX_CALLS) {
    stopped = `--max-calls ${MAX_CALLS} reached`;
    break;
  }
  if (used + matched + missed + closed >= MONTHLY_CEILING) {
    stopped = `monthly ceiling ${MONTHLY_CEILING} reached`;
    break;
  }

  try {
    const place = await findOnGoogle(r);

    if (!place) {
      await sql`UPDATE restaurants SET google_checked_at = now() WHERE id = ${r.id}`;
      missed += 1;
    } else if (place.businessStatus === "CLOSED_PERMANENTLY") {
      await sql`
        UPDATE restaurants SET google_checked_at = now(), google_place_id = ${place.id},
          hold_reason = ${"Google reports this business as permanently closed"}
        WHERE id = ${r.id}`;
      closed += 1;
    } else {
      /* One place id describes one restaurant. If another row already holds it,
       * this is the same mismatch the Yelp matcher made - record a miss rather
       * than give two restaurants one identity. */
      const [claimed] = await sql`
        SELECT name FROM restaurants WHERE google_place_id = ${place.id} AND id <> ${r.id} LIMIT 1
      `;
      if (claimed) {
        await sql`UPDATE restaurants SET google_checked_at = now() WHERE id = ${r.id}`;
        console.log(`\n  ~ ${r.name}: Google place already held by ${claimed.name}`);
        missed += 1;
      } else {
        /*
         * Only fetch a photo for a restaurant that has none.
         *
         * The photo fetch is its own billed SKU, and the write below is a
         * COALESCE that refuses to displace an image already in place. Without
         * this guard the two disagree: the first wide run paid for 445 photos
         * and stored zero, because it was working in review-count order and the
         * best-known restaurants all had Yelp photos already. Money spent on
         * images that went straight in the bin.
         */
        let photoUri = null;
        if (!NO_PHOTOS && r.needs_photo && place.photos?.[0]?.name) {
          photoUri = await photoUriFor(place.photos[0].name);
          if (photoUri) photos += 1;
        }
        const hours = hoursFrom(place.regularOpeningHours);
        const city = place.addressComponents?.find((c) => c.types?.includes("locality"))?.longText;
        // Google ends every formattedAddress with the country. On a site that
        // is only ever about San Diego, ", USA" is four characters of noise on
        // every restaurant page.
        const address = place.formattedAddress?.replace(/,\s*USA$/, "") ?? null;

        await sql`
          UPDATE restaurants SET
            google_checked_at   = now(),
            google_place_id     = ${place.id},
            google_rating       = ${place.rating ?? null},
            google_review_count = ${place.userRatingCount ?? null},
            rating              = COALESCE(rating, ${place.rating ?? null}),
            review_count        = COALESCE(review_count, ${place.userRatingCount ?? null}),
            website             = COALESCE(website, ${place.websiteUri ?? null}),
            address             = COALESCE(address, ${address}),
            city                = COALESCE(city, ${city ?? null}),
            hours               = COALESCE(hours, ${hours ? JSON.stringify(hours) : null}::jsonb),
            photo               = COALESCE(photo, ${photoUri})
          WHERE id = ${r.id}`;
        matched += 1;
      }
    }

    process.stdout.write(
      `\r  ${i + 1}/${targets.length}  ${searchCalls} searches, ${photoCalls} photos`,
    );
    await sleep(120);
  } catch (err) {
    if (err instanceof StopRun) {
      stopped = err.message;
      break;
    }
    // A transient failure leaves google_checked_at NULL, so the row is retried.
    console.log(`\n  ! ${r.name}: ${err.message}`);
  }
}

const spent = searchCalls * COST_PER_SEARCH + photoCalls * COST_PER_PHOTO;
const [after] = await sql`
  SELECT count(*) FILTER (WHERE photo IS NOT NULL)::int AS with_photo,
         count(*) FILTER (WHERE google_rating IS NOT NULL)::int AS with_google,
         count(*) FILTER (WHERE hours IS NOT NULL AND hours <> '[]'::jsonb)::int AS with_hours,
         count(*) FILTER (WHERE address IS NOT NULL)::int AS with_address,
         count(*)::int AS total
  FROM restaurants WHERE hold_reason IS NULL`;

console.log(
  `\n\n${searchCalls} searches + ${photoCalls} photo fetches = ` +
    `$${spent.toFixed(2)} at list price (free inside the monthly allowance).\n` +
    `  ${matched} matched  (${photos} brought a photo)\n` +
    `  ${missed} no confident match\n` +
    `  ${closed} permanently closed - held\n\n` +
    `${after.with_photo}/${after.total} have a photo, ` +
    `${after.with_google} a Google rating, ` +
    `${after.with_hours} hours, ` +
    `${after.with_address} an address.\n` +
    `${used + searchCalls}/${MONTHLY_CEILING} of this month's ceiling used.`,
);
if (stopped) console.log(`\nStopped: ${stopped}`);
