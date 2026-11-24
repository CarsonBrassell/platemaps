import Link from "next/link";
import { restaurantHref } from "@/lib/restaurantHref";
import type { TasteMatch } from "@/lib/tasteMatch";
import type { PersonalityProfile } from "@/lib/personality";
import { PersonalityCardBody, PersonalityMatchBody } from "@/components/PersonalityCardBody";

/**
 * The phone profile's Taste match — twin of `TasteMatchCard`, same data, same
 * body. Differences are all layout: the summary tiles stack (two columns would
 * leave "Classic American · Spice Chaser" nowhere to go at 390px) and the
 * restaurant link takes the `min-h-11` target this tree requires.
 *
 * `to` is the profile page's `?nav=` carrier, so the tap keeps the nav variant.
 */
export function PhoneTasteMatchCard({
  friendName,
  personality,
  tryPick,
  to = (href) => href,
}: {
  friendName: string;
  personality: { you: PersonalityProfile | null; them: PersonalityProfile | null };
  tryPick?: TasteMatch["tryPick"];
  to?: (href: string) => string;
}) {
  const { you, them } = personality;
  return (
    <section aria-label="Taste match" className="mx-4 mt-6 rounded-2xl bg-white px-5 py-5">
      <p className="mono-label text-zinc-900">Taste match</p>

      {!you || !them ? (
        <p className="mt-3 text-sm text-zinc-500">
          {!you ? "Post a few more plates to see your taste match." : `${friendName} needs a few more plates for a taste match.`}
        </p>
      ) : (
        <PersonalityMatchBody
          friendName={friendName}
          you={you}
          them={them}
          stacked
          pick={
            tryPick && (
              <>
                <p className="mono-label text-zinc-500">Try their pick</p>
                <p className="mt-1 text-sm font-medium text-zinc-800">{tryPick.cuisine}</p>
                <Link
                  href={to(restaurantHref("/m/restaurant", { id: tryPick.restaurantId }))}
                  className="-mb-3 flex min-h-11 items-center text-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  {tryPick.restaurantName}
                </Link>
              </>
            )
          }
        />
      )}
    </section>
  );
}

/**
 * "Your food personality", phone — twin of `FlavorProfileCard`, same data and
 * radar. The tiles stack, as they do in the Taste match card above.
 * `className` is the outer spacing: the card brings its own margins on
 * `/m/u/[id]` and sits margin-free inside the account screen's padded column.
 */
export function PhoneFlavorProfileCard({
  flavor,
  className = "mx-4 mt-6",
}: {
  flavor: PersonalityProfile | null;
  className?: string;
}) {
  return (
    <section aria-label="Your food personality" className={`${className} rounded-2xl bg-white px-5 py-5`}>
      <p className="mono-label text-zinc-900">Your food personality</p>

      {!flavor ? (
        <p className="mt-3 text-sm text-zinc-500">Post a few more plates to see your food personality.</p>
      ) : (
        <PersonalityCardBody flavor={flavor} stacked />
      )}
    </section>
  );
}
