import { aspectScores } from "@/lib/aspectScores";
import { BEST_AT, BEST_AT_LABELS } from "@/data/reviewScales";
import type { RestaurantAspectTally } from "@/lib/db";

function emojiFor(aspect: string) {
  return BEST_AT.find((b) => b.label === aspect)?.emoji;
}

/**
 * How this restaurant's own reviews score each category.
 *
 * Scores come from src/lib/aspectScores.ts, which turns each review's best/
 * worst aspect picks into a star score — see that file for the arithmetic and
 * for why an aspect nobody mentioned is left out entirely rather than scored
 * badly for never coming up.
 *
 * Deliberately unlabelled and unexplained: no section heading, no evidence
 * line, no best/worst summary. A category and a number is the whole statement.
 *
 * Laid out as a row of columns rather than a stacked list, and with no bar —
 * ordering already carries the ranking, so a bar would encode a second time
 * what the sequence and the number both say. The score is machine-computed and
 * set in mono, per the type split in PRODUCT.md.
 */
export function RestaurantAspects({ tally }: { tally: RestaurantAspectTally }) {
  const scored = aspectScores(BEST_AT_LABELS, tally.overall, tally.votes, tally.reviewCount)
    .filter((s) => !s.unremarked && s.stars !== null)
    .sort((a, b) => b.stars! - a.stars!);

  // Nothing measured, nothing to say — the block doesn't render an empty
  // state, it just isn't there.
  if (scored.length === 0) return null;

  return (
    <section
      aria-label="Category ratings from PlateMaps reviews"
      className="rounded-2xl bg-white px-5 py-5 sm:px-6"
    >
      {/* auto-fit rather than a fixed column count: a restaurant with three
          rated categories gets three wide columns, one with eight wraps to a
          second row instead of crushing them to unreadable slivers. */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-x-2 gap-y-4">
        {scored.map((s) => (
          <li key={s.aspect} className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-sm leading-none" aria-hidden="true">
              {emojiFor(s.aspect)}
            </span>
            <span className="w-full truncate text-[11px] leading-tight text-zinc-500">
              {s.aspect}
            </span>
            <span className="font-mono text-lg font-semibold leading-none tabular-nums text-zinc-900">
              {s.stars!.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>

      {/* The sample the numbers came from. Kept because a 4.5 with no
          denominator is unattributable, but sized to stay out of the way. */}
      <p className="mono-label mt-4 text-zinc-500">
        {tally.reviewCount} {tally.reviewCount === 1 ? "review" : "reviews"}
      </p>
    </section>
  );
}
