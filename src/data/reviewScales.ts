/**
 * The emoji scales and amenity chips behind the review composer.
 *
 * Ratings are stored as the existing 0–10 number; the face is presentation
 * only. Vibe is stored as its label ("Lively"), so adding a stop here doesn't
 * invalidate rows already written.
 */

/** One face per rating point, so dragging the slider always changes something. */
export const RATING_FACES: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "🤢", label: "Never again" },
  { emoji: "😣", label: "Rough" },
  { emoji: "😖", label: "Missed it" },
  { emoji: "😕", label: "Meh" },
  { emoji: "😐", label: "Just fine" },
  { emoji: "🙂", label: "Solid" },
  { emoji: "😊", label: "Pretty good" },
  { emoji: "😋", label: "Really good" },
  { emoji: "😍", label: "Loved it" },
  { emoji: "🤩", label: "Outstanding" },
  { emoji: "🏆", label: "Perfect plate" },
];

export function faceForRating(rating: number) {
  const i = Math.max(0, Math.min(RATING_FACES.length - 1, Math.round(rating)));
  return RATING_FACES[i];
}

export const VIBES: ReadonlyArray<{ emoji: string; label: string; blurb: string }> = [
  { emoji: "🧘", label: "Chill", blurb: "Quiet enough to hear yourself think" },
  { emoji: "🕯️", label: "Cozy", blurb: "Low light, lingering kind of place" },
  { emoji: "🍽️", label: "Casual", blurb: "Easy, everyday, no fuss" },
  { emoji: "🎶", label: "Lively", blurb: "Music up, tables full" },
  { emoji: "🔥", label: "Buzzing", blurb: "Loud, packed, a whole scene" },
];

export const AMENITIES: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "🌤️", label: "Outdoor seating" },
  { emoji: "🍸", label: "Great cocktails" },
  { emoji: "🐕", label: "Dog friendly" },
  { emoji: "📅", label: "Takes reservations" },
  { emoji: "🌙", label: "Open late" },
  { emoji: "👥", label: "Good for groups" },
  { emoji: "⚡", label: "Quick service" },
  { emoji: "🌱", label: "Vegan options" },
  { emoji: "🅿️", label: "Easy parking" },
  { emoji: "🎵", label: "Good music" },
];

export const AMENITY_LABELS: readonly string[] = AMENITIES.map((a) => a.label);
export const VIBE_LABELS: readonly string[] = VIBES.map((v) => v.label);

/** Emoji for an amenity label, for rendering it back on a post card. */
export function amenityEmoji(label: string) {
  return AMENITIES.find((a) => a.label === label)?.emoji;
}

export function vibeEmoji(label: string) {
  return VIBES.find((v) => v.label === label)?.emoji;
}
