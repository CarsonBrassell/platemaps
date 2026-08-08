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

/**
 * The one thing a restaurant does better than anything else it does.
 *
 * Superlative on purpose — a place that is "good at food" is every place, and a
 * list where everything can be ticked tells a reader nothing. It shares the
 * `vibe` column with the room scale above rather than opening a second one, so
 * posts written under either vocabulary keep rendering.
 */
export const BEST_AT: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "🍳", label: "Food" },
  { emoji: "🕯️", label: "Ambiance" },
  { emoji: "🙋", label: "Service" },
  { emoji: "📖", label: "Menu variety" },
  { emoji: "🍸", label: "Drinks" },
  { emoji: "💸", label: "Value" },
  { emoji: "⚡", label: "Speed" },
  { emoji: "🍰", label: "Dessert" },
];

export const AMENITY_LABELS: readonly string[] = AMENITIES.map((a) => a.label);
export const VIBE_LABELS: readonly string[] = VIBES.map((v) => v.label);
export const BEST_AT_LABELS: readonly string[] = BEST_AT.map((b) => b.label);

/** Everything the `vibe` column is allowed to hold, old vocabulary and new. */
export const ROOM_LABELS: readonly string[] = [...VIBE_LABELS, ...BEST_AT_LABELS];

/** Emoji for an amenity label, for rendering it back on a post card. */
export function amenityEmoji(label: string) {
  return AMENITIES.find((a) => a.label === label)?.emoji;
}

export function vibeEmoji(label: string) {
  return VIBES.find((v) => v.label === label)?.emoji;
}

/**
 * How a `vibe` value reads on a post card. "Lively" says what it means on its
 * own; "Food" does not, so the newer vocabulary gets its sentence back.
 */
export function vibeChip(label: string): { emoji?: string; text: string } {
  const best = BEST_AT.find((b) => b.label === label);
  if (best) return { emoji: best.emoji, text: `Best at ${label.toLowerCase()}` };
  return { emoji: vibeEmoji(label), text: label };
}
