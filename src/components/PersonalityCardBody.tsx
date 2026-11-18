import { TasteRadar } from "@/components/TasteRadar";
import { formatLift, type PersonalityProfile, type PersonalityType } from "@/lib/personality";

/** One line under the headline: what the strongest type means. */
const BLURB: Record<PersonalityType, string> = {
  Adventurer: "Always onto a cuisine you haven't had yet.",
  Foodie: "Drawn to the places critics write about.",
  Wellness: "Lighter plates, greens and grain bowls.",
  "Sweet Tooth": "Dessert, pastries and sweet drinks.",
  Regular: "You find a spot and keep going back.",
  "Quick Bite": "Counter service and food on the go.",
  "Classic American": "Burgers, pizza, wings and the classics.",
  "Spice Chaser": "The hotter the better.",
};

/**
 * Everything inside "Your food personality" below its label, shared by the web
 * card (`FlavorProfileCard`) and the phone card (`PhoneFlavorProfileCard`).
 * `stacked` puts the two tiles in one column for the phone.
 *
 * The headline is the strongest type (two when the second is nearly as
 * strong); the tiles list the three strongest with their lift and the one
 * least like you. Lift is "times the average eater", so 1.0x is average.
 */
export function PersonalityCardBody({ flavor, stacked }: { flavor: PersonalityProfile; stacked?: boolean }) {
  const ranked = flavor.spokes
    .map((s, i) => ({ s, l: flavor.lift[i] }))
    .sort((a, b) => b.l - a.l || a.s.localeCompare(b.s));
  const least = ranked[ranked.length - 1];
  return (
    <>
      <p className="mt-2 font-display text-2xl font-semibold text-zinc-900">{flavor.top.join(" + ")}</p>
      <p className="mt-1 text-sm text-zinc-500">{BLURB[flavor.top[0]]}</p>

      <div className={stacked ? "mt-3" : "mt-4"}>
        <TasteRadar match={flavor} average={flavor.average} valueLabels={flavor.lift.map(formatLift)} />
      </div>

      <div className={`${stacked ? "mt-4 grid gap-2.5" : "mt-5 grid grid-cols-2 gap-3"} text-left`}>
        <div className="rounded-xl bg-pm-grey-tint/50 p-3">
          <p className="mono-label text-zinc-500">Most like you</p>
          <ul className="mt-1 space-y-0.5 text-sm font-medium text-zinc-800">
            {ranked.slice(0, 3).map(({ s, l }) => (
              <li key={s} className="flex justify-between gap-3">
                <span>{s}</span>
                <span className="font-mono tabular-nums text-zinc-500">{formatLift(l)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-pm-grey-tint/50 p-3">
          <p className="mono-label text-zinc-500">Least like you</p>
          <p className="mt-1 flex justify-between gap-3 text-sm font-medium text-zinc-800">
            <span>{least.s}</span>
            <span className="font-mono tabular-nums text-zinc-500">{formatLift(least.l)}</span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            <span className="font-mono tabular-nums">1.0x</span> is the average eater
          </p>
        </div>
      </div>
    </>
  );
}
