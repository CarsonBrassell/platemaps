"use client";

import { uploadPhotos, type PhotoDraft } from "@/lib/photos";
import type { PickedDish } from "@/components/post/DishPicker";
import type { PostMedia } from "@/components/feed/types";
import { CloseIcon } from "@/components/icons";
import { tapFlash } from "@/lib/tapFlash";

/**
 * A plate the composer has finished asking about and set aside while it asks
 * about the next one. Photo, dish, percent — the three things the collage's
 * pill prints, and nothing the meal shares (the place, the words, the
 * best-at chips), which stay in the composer's own state and are written
 * once, on the hero.
 */
export type PlateDraft = {
  photos: PhotoDraft[];
  dish: PickedDish;
  pct: number;
};

/** Six frames is where the collage stops being readable — see MealCollage. */
export const MAX_MEAL_PLATES = 6;

/**
 * The plate being entered right now joins the banked ones at the end, and the
 * first plate entered is the hero row: the one that carries the caption, the
 * votes and the points. Which frame the collage enlarges is decided at render
 * time by rating, so the order here is purely the order the meal was eaten.
 */
export function assembleMeal(
  banked: PlateDraft[],
  current: PlateDraft,
): { hero: PlateDraft; courses: PlateDraft[] } {
  const all = [...banked, current];
  return { hero: all[0], courses: all.slice(1) };
}

/**
 * Every photo of every plate in one all-or-nothing upload — `uploadPhotos`
 * already cleans up after itself when part of a batch fails, and one batch
 * means one cleanup rule — then dealt back out per plate. Returns the URLs
 * in the same shape as the plates went in, hero first.
 */
export async function uploadMealPhotos(plates: PlateDraft[]): Promise<string[][]> {
  const urls = await uploadPhotos(plates.flatMap((p) => p.photos));
  let at = 0;
  return plates.map((p) => {
    const mine = urls.slice(at, at + p.photos.length);
    at += p.photos.length;
    return mine;
  });
}

/** The `courses` field of the POST body — what /api/posts parses. */
export function coursesPayload(
  courses: PlateDraft[],
  urlsByCourse: string[][],
  restaurantName: string | undefined,
) {
  return courses.map((c, i) => ({
    dishName: c.dish.name,
    price: c.dish.price,
    rating: c.pct,
    media: urlsByCourse[i].map<PostMedia>((url) => ({
      url,
      type: "image",
      alt: restaurantName ? `${c.dish.name} at ${restaurantName}` : c.dish.name,
    })),
  }));
}

/**
 * Sits under the meter: the plates already set aside, and the way to set
 * this one aside too. Pressing "Add another plate" is how a post becomes a
 * meal — there is no separate mode to enter first, because nobody decides
 * they are posting a meal before they have rated the first plate.
 *
 * Banked plates are chips that read like the collage's pills — name and
 * percent — with a way to unmake each, since a plate banked by mistake would
 * otherwise be a row in the database.
 */
export function MealPlates({
  banked,
  canAdd,
  onAdd,
  onRemove,
}: {
  banked: PlateDraft[];
  /** False when the current plate isn't ready to bank, or the meal is full. */
  canAdd: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const full = banked.length + 1 >= MAX_MEAL_PLATES;
  return (
    <div className="mt-4">
      {banked.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Plates in this meal">
          {banked.map((p, i) => (
            <li
              key={`${p.dish.id}-${i}`}
              className="flex min-h-9 items-center gap-1.5 rounded-full bg-pm-grey-tint pl-3 pr-1 text-sm text-zinc-900"
            >
              <span className="max-w-[10rem] truncate font-medium">{p.dish.name}</span>
              <span className="font-mono text-[13px] font-semibold text-pm-orange-text">
                {p.pct}%
              </span>
              <button
                type="button"
                aria-label={`Remove ${p.dish.name} from the meal`}
                onClick={() => onRemove(i)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Secondary, not the orange pill: Next/Post it owns the primary slot
          in the footer, and this is the optional branch off it. Tan chip
          styling, same rank as the best-at chips. */}
      <button
        type="button"
        disabled={!canAdd || full}
        onClick={(e) => {
          tapFlash(e.currentTarget);
          onAdd();
        }}
        className="flex min-h-11 items-center gap-1.5 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-all hover:-translate-y-px hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <span aria-hidden="true" className="font-mono text-base leading-none">
          +
        </span>
        {full ? `That's the most a meal can hold` : "Add another plate"}
      </button>
      {!full && (
        <p className="mt-1.5 text-xs text-zinc-500">
          Had more than one thing? Every plate gets its own rating, and the post shows them
          all in one collage.
        </p>
      )}
    </div>
  );
}
