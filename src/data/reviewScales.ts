/**
 * The emoji scales behind the review composer.
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

/*
 * The room scale (Chill / Cozy / Casual / Lively / Buzzing) and the amenity
 * list (Outdoor seating, Dog friendly, Takes reservations, …) used to live
 * here. Both are deleted, and the reason is the same one that removed the
 * invented wait-time copy: **no composer ever offered them, so nothing a real
 * person did could produce one.**
 *
 * Every room word on the feed came from `scripts/simulate-activity.mjs`, which
 * says in its own header that it writes only that vocabulary. Amenities were
 * worse — a vocabulary, a validator and an emoji renderer with **zero rows** in
 * the table, ever. They read as somebody's opinion of a restaurant while being
 * demo furniture, sitting on the same card and in the same chip shape as the
 * one label a poster does choose.
 *
 * `BEST_AT` below is that label, and it is what survives. If an atmosphere
 * vocabulary is ever wanted again, it needs a control in the composer first —
 * the vocabulary is the easy half.
 */

/**
 * The one thing a restaurant does better than anything else it does.
 *
 * Superlative on purpose — a place that is "good at food" is every place, and a
 * list where everything can be ticked tells a reader nothing. It shares the
 * It owns the `vibe` column outright now that the room scale is deleted — see
 * `vibeChip` for how the rows still holding a room word are filtered out.
 *
 * **Everything here is something the plates cannot say.** Food is deliberately
 * absent: the restaurant's plate score already *is* its food rating — the
 * average of every dish rating left there (lib/plateScore.ts) — so a Food
 * category would put a second, weaker food number beside the real one and invite
 * the two to disagree. These five measure the things you can't taste.
 */
export const BEST_AT: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "🕯️", label: "Ambiance" },
  { emoji: "🙋", label: "Service" },
  { emoji: "📖", label: "Menu variety" },
  { emoji: "🍸", label: "Drinks" },
  { emoji: "💸", label: "Value" },
];

/**
 * Chips the composer used to offer and no longer does.
 *
 * Kept solely so a post written while they existed still reads as a sentence
 * on its feed card — see `vibeChip`. Deliberately NOT part of
 * `BEST_AT_LABELS`: a retired chip must stay unpickable in
 * the composer, unwritable through /api/posts, and absent from both the
 * restaurant page's category scores and Discover's "Rated well for" facet.
 * Votes already in `post_aspect_votes` for these simply stop being counted.
 *
 * Food is the newest entry and the only one retired for being *redundant*
 * rather than useless — see the note above. Its existing votes stop counting
 * like any other retired chip, which is the intended outcome: the plate score
 * answers that question now.
 */
const RETIRED_BEST_AT: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "⚡", label: "Speed" },
  { emoji: "🍰", label: "Dessert" },
  { emoji: "🍳", label: "Food" },
];

export const BEST_AT_LABELS: readonly string[] = BEST_AT.map((b) => b.label);

/**
 * How a `vibe` value reads on a post card, or **null when it should not read at
 * all.**
 *
 * The null branch is the whole point. `posts.vibe` holds two unrelated
 * vocabularies: the best-at label a poster actually picked, and — on the ~49
 * rows `simulate-activity.mjs` wrote — a room word from the deleted atmosphere
 * scale. Those rows are still in the table and are not worth a migration, so
 * the filter happens on the read: a label that is not a best-at chip, current
 * or retired, renders as nothing.
 *
 * Retired chips still resolve, so an old "Speed" post keeps saying "Best at
 * speed" rather than degrading to a bare "Speed".
 */
export function vibeChip(label: string): { emoji?: string; text: string } | null {
  const best = [...BEST_AT, ...RETIRED_BEST_AT].find((b) => b.label === label);
  if (!best) return null;
  return { emoji: best.emoji, text: `Best at ${label.toLowerCase()}` };
}
