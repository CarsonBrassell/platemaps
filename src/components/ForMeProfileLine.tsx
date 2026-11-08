import { ReasonText } from "@/components/ReasonText";
import type { ForMeProfile } from "@/lib/discoverWire";

/**
 * The one quiet line above the For me cards: "Tuned to you · $11–18 a plate ·
 * usually within 7 mi · pizza, coffee, breakfast". What the list has learned
 * about the viewer, said once, with each part left out when there is too little
 * to say it and the whole line left out when there is nothing at all. The
 * numbers wear the mono every other number does (`ReasonText`); the caller sets
 * size, colour and spacing, since the phone header and the web row differ in
 * all three. The profile is the viewer's own and arrives only on the private POST.
 */

/** Cuisines read as prose ("pizza"), but an acronym keeps its case ("BBQ"). */
const prose = (cuisine: string) => (cuisine === cuisine.toUpperCase() ? cuisine : cuisine.toLowerCase());

/** The parts after "Tuned to you", in order; empty when the profile has nothing to say. */
export function profileParts(profile: ForMeProfile): string[] {
  const parts: string[] = [];
  if (profile.budget) {
    const { lo, hi } = profile.budget;
    parts.push(`${lo === hi ? `$${lo}` : `$${lo}–${hi}`} a plate`);
  }
  if (profile.radiusMi != null) parts.push(`usually within ${profile.radiusMi} mi`);
  if (profile.cuisines.length > 0) parts.push(profile.cuisines.map(prose).join(", "));
  return parts;
}

export function ForMeProfileLine({
  profile,
  className,
}: {
  profile: ForMeProfile;
  className?: string;
}) {
  const parts = profileParts(profile);
  if (parts.length === 0) return null;
  return (
    <p className={className}>
      <ReasonText text={["Tuned to you", ...parts].join(" · ")} />
    </p>
  );
}
