import { MIN_REVIEWS, aspectScores } from "@/lib/aspectScores";
import { BEST_AT, BEST_AT_LABELS } from "@/data/reviewScales";
import type { RestaurantAspectTally } from "@/lib/db";
import { ASPECT_SCALE_MAX } from "@/lib/ratingDisplay";

function emojiFor(aspect: string) {
  return BEST_AT.find((b) => b.label === aspect)?.emoji;
}

/**
 * How this restaurant's own reviews rate each category, out of 5.
 *
 * The arithmetic is in src/lib/aspectScores.ts. The short version: the
 * restaurant's sourced rating is the base, the votes decide the spacing around
 * it, and **the five ratings average back to exactly that base**. A category
 * everyone singles out sits above it; the ones nobody mentioned sit at or just
 * under it, paying for the one that rose; a category people complain about drops
 * well below.
 *
 * ## Below MIN_REVIEWS there are counts but no ratings
 *
 * Ranking five categories against each other needs enough reviews that no single
 * voter decides one. Under that floor the block shows each category's votes with a
 * dash where the rating goes — see MIN_REVIEWS in lib/aspectScores.ts.
 *
 * ## Every category renders, including the unmentioned ones
 *
 * This block used to drop categories with no votes, because under the old model
 * they carried no information. Under this one they do: a category sitting at the
 * restaurant's own rating is the statement that nothing distinguishes it, and
 * dropping it would also break the thing a reader can check — that the row
 * averages to the rating. Five categories, always, or none at all.
 *
 * Deliberately unlabelled and unexplained: no section heading, no best/worst
 * summary. A category and its rating is the whole statement.
 *
 * Laid out as a row of columns rather than a stacked list, and with no bar —
 * ordering already carries the ranking, so a bar would encode a second time what
 * the sequence and the number both say. Machine-computed, so mono, per the type
 * split in PRODUCT.md.
 */
export function RestaurantAspects({ tally }: { tally: RestaurantAspectTally }) {
  const scored = aspectScores(BEST_AT_LABELS, tally.base, tally.votes, tally.reviewCount);
  const voted = scored.some((s) => !s.unremarked);

  /* Below MIN_REVIEWS the model returns no scores — too few reviews to rank five
     categories against each other. The votes are still real, so they are still
     shown; it is the ranking of them that has to wait. Sorted by raw vote balance
     there, which is the same order the scores would come out in. */
  const rated = scored[0]?.score !== null;
  const rows = [...scored].sort((a, b) =>
    rated ? (b.score ?? 0) - (a.score ?? 0) : b.net - a.net,
  );

  /* Nothing to say at all: no sourced rating to space around, or nobody has
     reviewed the place and so there is not even a count to print. The block
     doesn't render an empty state, it just isn't there. */
  if (tally.base <= 0) return null;
  if (!rated && !voted) return null;

  return (
    <section
      aria-label="Category ratings from PlateMaps reviews"
      className="rounded-2xl bg-white px-5 py-5 sm:px-6"
    >
      {/* auto-fit rather than a fixed column count: five categories get five
          wide columns, and a longer vocabulary wraps to a second row instead of
          crushing them to unreadable slivers. */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-x-2 gap-y-4">
        {rows.map((s) => (
          <li key={s.aspect} className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-sm leading-none" aria-hidden="true">
              {emojiFor(s.aspect)}
            </span>
            <span className="w-full truncate text-[11px] leading-tight text-zinc-500">
              {s.aspect}
            </span>
            {/* The denominator is carried and muted — a step down in size so the
                column still reads as one number at a glance rather than as a
                fraction. See ASPECT_SCALE_MAX for why it is never dropped. */}
            {s.score !== null ? (
              <span
                className={`font-mono text-lg font-semibold leading-none tabular-nums ${
                  s.unremarked ? "text-zinc-400" : "text-zinc-900"
                }`}
              >
                {s.score.toFixed(1)}
                <span className="text-[11px] font-normal text-zinc-400">
                  /{ASPECT_SCALE_MAX}
                </span>
              </span>
            ) : (
              /* Below the floor: a dash where the rating goes, so the column
                 still reads as "this is where a number will be" rather than as a
                 category that failed to score. */
              <span className="font-mono text-lg font-semibold leading-none text-zinc-300">
                &ndash;
              </span>
            )}

            {/* The evidence: how many people put this category up, and how many
                put it down. Without it the rating is unfalsifiable — a reader
                cannot tell 12-praise-to-0 from 1-to-0, and those are very
                different claims that can land on similar numbers.

                Arrows rather than words, because five columns of "12 praised"
                does not fit at 64px. Deliberately NOT the ▲/△ glyphs, which
                DESIGN.md reserves for post votes — these are counts, not a
                control. Faults take the same red-700 the composer's
                let-you-down chip uses, so the colour means one thing app-wide. */}
            <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums">
              {s.praised === 0 && s.faulted === 0 ? (
                <span className="text-zinc-300">&mdash;</span>
              ) : (
                <>
                  {s.praised > 0 && (
                    <span className="text-zinc-500">
                      {s.praised}
                      <span aria-hidden="true">&uarr;</span>
                      <span className="sr-only"> praised</span>
                    </span>
                  )}
                  {s.faulted > 0 && (
                    <span className="text-red-700">
                      {s.faulted}
                      <span aria-hidden="true">&darr;</span>
                      <span className="sr-only"> let down</span>
                    </span>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* The sample, and what the row adds up to. The second half is the claim
          worth being able to check: these five average to the restaurant's own
          rating, so a reader can see the block isn't inventing goodwill. */}
      <p className="mono-label mt-4 text-zinc-500">
        {!rated
          ? `${tally.reviewCount} of ${MIN_REVIEWS} reviews needed to rate these`
          : voted
            ? `${tally.reviewCount} ${tally.reviewCount === 1 ? "review" : "reviews"} · averages to ${tally.base.toFixed(1)}`
            : `nobody has singled out a category yet · all at ${tally.base.toFixed(1)}`}
      </p>
    </section>
  );
}
