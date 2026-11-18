import Link from "next/link";
import { restaurantHref } from "@/lib/restaurantHref";
import type { TasteMatch } from "@/lib/tasteMatch";
import type { PersonalityProfile } from "@/lib/personality";
import { PersonalityCardBody, PersonalityMatchBody } from "@/components/PersonalityCardBody";

/**
 * The web profile's Taste match — a friend's food personality wheel laid over
 * yours (lib/personality.ts), one number for how alike they are, what you share
 * and where you split, plus the cuisine match's "Try their pick" when there is one.
 *
 * Either wheel being null is the empty state (too few posts on that side),
 * which keeps the card in place rather than vanishing: a friend's
 * profile that says "post a few more plates" is a prompt; one that's missing a
 * card is a mystery. Whether the card shows at all — friends only, never your
 * own profile (which gets `FlavorProfileCard` below instead) — is
 * `getPersonalityMatchForProfile`'s call, not this component's.
 *
 * The phone twin is `mobile/PhoneTasteMatchCard`. Both render
 * `PersonalityMatchBody`; only the clothes differ.
 */
export function TasteMatchCard({
  friendName,
  personality,
  tryPick,
}: {
  friendName: string;
  personality: { you: PersonalityProfile | null; them: PersonalityProfile | null };
  tryPick?: TasteMatch["tryPick"];
}) {
  const { you, them } = personality;
  return (
    <section aria-label="Taste match" className="mx-4 mt-6 rounded-2xl bg-white px-6 py-6 sm:mx-6">
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
          pick={
            tryPick && (
              <>
                <p className="mono-label text-zinc-500">Try their pick</p>
                <p className="mt-1 text-sm font-medium text-zinc-800">
                  {tryPick.cuisine}
                  <span className="text-zinc-400"> · </span>
                  <Link
                    href={restaurantHref("/restaurant", { id: tryPick.restaurantId })}
                    className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
                  >
                    {tryPick.restaurantName}
                  </Link>
                </p>
              </>
            )
          }
        />
      )}
    </section>
  );
}

/**
 * "Your food personality" — the eight-type wheel (lib/personality.ts), shown on
 * your own account screen and your own public profile. Same radar, one series,
 * plus a dashed ring for the average eater; the body is PersonalityCardBody.
 *
 * `flavor` is null for the empty state, kept in place for the same reason as
 * above. `className` is the outer spacing: on `/u/[id]` the card sits on the
 * cream ground and brings its own margins, on `/account` it sits inside the
 * page's padded column and needs none.
 */
export function FlavorProfileCard({
  flavor,
  className = "mx-4 mt-6 sm:mx-6",
}: {
  flavor: PersonalityProfile | null;
  className?: string;
}) {
  return (
    <section aria-label="Your food personality" className={`${className} rounded-2xl bg-white px-6 py-6`}>
      <p className="mono-label text-zinc-900">Your food personality</p>

      {!flavor ? (
        <p className="mt-3 text-sm text-zinc-500">Post a few more plates to see your food personality.</p>
      ) : (
        <PersonalityCardBody flavor={flavor} />
      )}
    </section>
  );
}
