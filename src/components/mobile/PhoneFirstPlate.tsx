import Link from "next/link";
import { MIN_RATED_DISHES, MIN_TOTAL_RATINGS, type PlateScore } from "@/lib/plateScore";

/**
 * What a restaurant says when it has no PlateMaps score yet.
 *
 * `PhoneDetailHits` returns null when nothing here has been rated, so the whole
 * top of the page used to skip from the photo straight to the menu — the one
 * section that is supposed to be the reason for the app simply absent, with no
 * indication that it was ever meant to be there. On 1,257 of the 1,303 listed
 * restaurants, that is what a visitor currently sees.
 *
 * Absence stated is worth more than absence hidden, and here it is worth more
 * than a score would be: this is the only screen in the app where the person
 * reading it is standing in the place, holding the thing, and is therefore the
 * exact person who can fix the gap. So the empty state asks.
 *
 * **Two states, not one.** "Nobody has rated anything here" and "three people
 * have, which isn't enough yet" are different facts and want different
 * sentences — the first is an invitation, the second is a countdown somebody is
 * already partway through. `PlateScore` distinguishes them deliberately (see
 * the note on its `ready` field), so nothing has to be re-derived here.
 *
 * Nothing is fabricated to fill the space. The Yelp/Google stars in the hero
 * already carry the cold start; this card says plainly that the PlateMaps
 * number is missing rather than borrowing one to stand in for it.
 */
export function PhoneFirstPlate({
  restaurant,
  score,
  href,
}: {
  restaurant: { id: string; name: string };
  score: PlateScore;
  /** The composer, with this restaurant preselected and `?nav=` preserved. */
  href: string;
}) {
  // A restaurant with a score has its own section; this card is only for the
  // gap before one exists.
  if (score.ready) return null;

  const first = score.dishCount === 0;

  return (
    <section aria-label="No plate score yet">
      <h2 className="mono-label px-1 text-pm-grey-text">The Hits</h2>

      <div className="mt-2.5 rounded-2xl bg-white px-4 py-5">
        <p className="font-display text-[19px] font-semibold leading-snug text-zinc-900">
          {first ? "No plates here yet" : "Almost enough plates"}
        </p>

        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          {first ? (
            <>
              Nobody has rated a dish at {restaurant.name}. Post one and you set the first
              number on this page.
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-zinc-800">{score.dishCount}</span>{" "}
              {score.dishCount === 1 ? "dish" : "dishes"} rated so far. {needed(score)} and{" "}
              {restaurant.name} gets a PlateMaps score.
            </>
          )}
        </p>

        <Link
          href={href}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-pm-orange px-5 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {first ? "Post the first plate" : "Add a plate"}
        </Link>
      </div>
    </section>
  );
}

/**
 * What is still short, in words. Both thresholds have to be met, so a page can
 * be short of one, the other, or both — and saying "2 more dishes" to somebody
 * who actually needs five more ratings would be a countdown that lies.
 */
function needed(score: PlateScore) {
  const dishes = Math.max(0, MIN_RATED_DISHES - score.dishCount);
  const ratings = Math.max(0, MIN_TOTAL_RATINGS - score.ratingCount);

  const parts: string[] = [];
  if (dishes > 0) parts.push(`${dishes} more dish${dishes === 1 ? "" : "es"}`);
  if (ratings > 0) parts.push(`${ratings} more rating${ratings === 1 ? "" : "s"}`);

  // Both satisfied but not ready cannot happen — `ready` is exactly these two
  // conditions — so this is unreachable rather than a real fallback.
  if (parts.length === 0) return "A couple more";

  return parts.join(" and ");
}
