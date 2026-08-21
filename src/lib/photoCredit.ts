/**
 * Who took the photo, derived from where it is served from.
 *
 * Every restaurant photo used to come from Yelp, so two components printed a
 * hardcoded "Photo: Yelp" beside any image that existed. That stopped being
 * true the moment photos started coming off restaurants' own websites — and a
 * credit naming the wrong source is worse than no credit, because Yelp's
 * display terms are the entire reason the line is there.
 *
 * The URL is the evidence, so it is also the source of truth. A photo served
 * from Yelp's CDN came from Yelp; nothing else has to be stored, and
 * `RestaurantView` does not grow a field that every visitor downloads once per
 * restaurant (see the note on the projection in lib/db.ts).
 *
 * A restaurant's own photograph of its own dining room gets no credit line: it
 * is theirs, published by them, on their own site, and captioning it with their
 * name inside a card that already carries their name reads as noise.
 */

/** Yelp's business photos, matching the host allowed in next.config.ts. */
const YELP_CDN = /(^|\.)fl\.yelpcdn\.com$/i;

export function photoCreditFor(photo: string | null | undefined): string | null {
  if (!photo) return null;
  // Local files under public/ are ours and are never credited.
  if (photo.startsWith("/")) return null;
  try {
    return YELP_CDN.test(new URL(photo).hostname) ? "Photo: Yelp" : null;
  } catch {
    // An unparseable value is data we do not understand; claiming a source for
    // it would be a guess.
    return null;
  }
}
