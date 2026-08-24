"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { formatPoints } from "@/lib/points";
import { PlateStarIcon } from "@/components/icons";
import { clearAward, usePointsAward, type PointsAward } from "@/lib/postCelebration";

/**
 * The feed screen's header: an optional count on the left, who you are on the
 * right. It carried a "Food Feed" title until that came off — see the note at
 * the title's old position.
 *
 * Same voice as the discover screen's (`src/app/m/page.tsx`): it sits directly
 * on the cream ground rather than on a card, the count line is mono because it
 * is a count, and the whole thing scrolls away
 * rather than sticking — a 390px screen has roughly 640 usable points of height
 * and the nav already owns the bottom ~96 of them.
 *
 * What discover does not have is a right-hand group, and this is where the two
 * diverge: the feed is a screen you arrive at, so it carries the two things the
 * web header carries beside its title — a way to search and the face of whoever
 * is signed in.
 *
 * ## Search goes to Discover, and the field is not `RestaurantSearch`
 *
 * `components/RestaurantSearch.tsx` was the obvious reuse and it does not fit,
 * for two reasons and only the second is about width:
 *
 * - **Every route it produces leaves the /m tree.** Its dropdown rows link to
 *   `/restaurant/<id>` and its Enter pushes `/?q=<term>` — both the web layout.
 *   A tap from this header would drop you out of the phone version with the
 *   phone nav gone and no way back, which is exactly the fork reason
 *   `PhoneFeedPostCard` documents for its own hrefs.
 * - **It is sized for the header row it lives in.** `hidden … sm:block lg:w-56`
 *   is a viewport query, and the /m column is 390px *inside* a wide viewport —
 *   so in the desktop preview it would render at its full 224px and take most
 *   of this row, while on a real handset it would not render at all.
 *
 * So the control here is a search button that expands a field on its own row,
 * and Enter hands the term to Discover as `/m?q=<term>` — the parameter
 * `lib/discoverFilters.ts` already parses, and the one the phone discover screen
 * already prints as a removable chip. There is deliberately **no typeahead**:
 * the dropdown is the part of `RestaurantSearch` that needs a per-keystroke
 * request and a second set of routes, and neither is worth inventing here when
 * the destination screen answers the same question with counts and filters.
 *
 * The field opens on its own row rather than in the title row because at 358px
 * of usable width the title plus a usable field do not both fit — a 190px input
 * is a field you cannot read your own query back out of.
 */
/** One tick per point. Ten of them is a little over half a second. */
const COUNT_STEP_MS = 55;

/**
 * What the chip should read right now.
 *
 * The total from `useAuth` is already the post-award figure by the time this
 * screen exists — the composer refreshes the account before it navigates — so
 * showing it directly would mean the number was simply bigger when you
 * arrived. Instead the pre-award figure is held while the token is in the air,
 * and the climb starts when it lands.
 *
 * Every update is inside a timer rather than in the effect body, which is the
 * state-in-effect rule this codebase has been caught by before.
 */
function usePointsClimb(total: number, award: PointsAward | null) {
  const [climbed, setClimbed] = useState<number | null>(null);

  useEffect(() => {
    if (!award?.arrived) return;
    const from = total - award.earned;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= award.earned; i++) {
      timers.push(setTimeout(() => setClimbed(from + i), i * COUNT_STEP_MS));
    }
    /* Hand the store back once the number has caught up, so the chip drops to
       reading the plain total and the next post starts clean. */
    timers.push(
      setTimeout(() => {
        setClimbed(null);
        clearAward();
      }, award.earned * COUNT_STEP_MS + 500),
    );
    return () => timers.forEach(clearTimeout);
  }, [award, total]);

  if (climbed !== null) return climbed;
  if (award && !award.arrived) return total - award.earned;
  return total;
}

/**
 * Points, beside the face.
 *
 * The header had no points on it at all, which made the reward for posting
 * invisible on the one screen you land on straight after earning it — and left
 * the flying token with nothing to fly into. Deliberately the quiet `chip`
 * treatment from `PointsBadge` rather than the orange one: this sits next to a
 * screen title, not on a leaderboard, and DESIGN.md's single accent is not for
 * decorating a header.
 *
 * `data-pm-points` is what `PhonePointsFly` measures to aim at. It is a
 * targeting hook, not a style hook — don't select on it in CSS.
 */
function PointsChip({ points }: { points: number }) {
  const award = usePointsAward();
  const shown = usePointsClimb(points, award);

  return (
    <span
      data-pm-points
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pm-grey-tint px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-pm-grey-text ${
        award?.arrived ? "points-chip-hit" : ""
      }`}
    >
      <PlateStarIcon className="h-3 w-4" />
      {formatPoints(shown)}
      <span className="sr-only"> Plate Points</span>
    </span>
  );
}

export function PhoneFeedHeader({ subtitle }: { subtitle?: React.ReactNode }) {
  const { account, isSignedIn, loading } = useAuth();

  /* Nothing to say, so nothing drawn — not an empty bar with padding in it.
     Once the title and the "Sign in" doorway both came off, a signed-out
     visitor was left with a header whose entire content was 12 points of
     whitespace above the tabs. Signing in is already the nav's Profile tab and
     every empty state on this screen; a header does not need to ask again.

     Rendered as nothing while the session is still resolving too. The blank
     disc that used to hold this row's height existed to stop the header
     flashing "Sign in" at somebody who was signed in — with that link gone,
     the only thing it holds is the gap this is removing. */
  if (!subtitle && !(isSignedIn && account) && !loading) return null;

  return (
    /* Tight on purpose. This header sits above a map that wants the whole
       screen, so every point it spends is a point the map doesn't get:
       `pt-2 pb-1` rather than `pt-4 pb-2`, and the title at 22px rather than
       26. `items-center` pairs the title with the controls on one optical
       line — with `items-start` the 44px buttons hung below a 22px cap height
       and added a row's worth of air on their own. */
    <header className="px-4 pb-1 pt-2">
      <div className="flex items-center justify-between gap-3">
        {/* No title. It read "Food Feed" over a feed you are already looking
            at, on the one screen the nav's Feed tab has already named — a
            label for a place nobody could be lost in. The subtitle stays
            because it carries a count, which the title never did.

            The caller owns those words; styled here so every subtitle this
            header is given lands in the same voice: a count is a machine
            value, and it sits on the cream ground, so --pm-grey-text rather
            than zinc-500 (4.28:1 there, and it fails). */}
        <div className="min-w-0">
          {subtitle && (
            <p className="font-mono text-xs tabular-nums text-pm-grey-text">{subtitle}</p>
          )}
        </div>

        {/* Search used to live here. It moved down to the row under the tabs
            (PhoneFeedSearch) — the top-right corner is the furthest point on
            the screen from a thumb holding the device.

            This header does not render on the map tab at all any more: the map
            runs to the top edge and the tabs float on it, so the title named a
            screen you can already see and the avatar duplicated the nav's
            Profile slot. See PhoneFeedScreen's map branch. */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Signed out puts a named doorway where the face goes rather than an
              anonymous circle: /m/account is the sign-in destination the rest of
              this tree points at (see PhoneFeedScreen's empty states). While the
              session is still resolving the slot holds its size with a blank tan
              disc, so the header does not flash "Sign in" at someone who is. */}
          {loading ? null : isSignedIn && account ? (
            <>
              <PointsChip points={account.points} />
              <Link
                href="/m/account"
                aria-label={`Your account, ${account.name}`}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                {account.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text">
                    {initials(account.name)}
                  </span>
                )}
              </Link>
            </>
          ) : null}
        </div>
      </div>

    </header>
  );
}

/* The search glyph that used to live here went with the search control — see
   PhoneFeedSearch, which now owns both. */
