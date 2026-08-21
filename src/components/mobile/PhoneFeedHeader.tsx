"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

/**
 * The Food Feed screen's header.
 *
 * Same voice as the discover screen's (`src/app/m/page.tsx`): it sits directly
 * on the cream ground rather than on a card, the screen title is Fraunces, the
 * line under it is mono because it is a count, and the whole thing scrolls away
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
export function PhoneFeedHeader({ subtitle }: { subtitle?: React.ReactNode }) {
  const { account, isSignedIn, loading } = useAuth();

  return (
    /* Tight on purpose. This header sits above a map that wants the whole
       screen, so every point it spends is a point the map doesn't get:
       `pt-2 pb-1` rather than `pt-4 pb-2`, and the title at 22px rather than
       26. `items-center` pairs the title with the controls on one optical
       line — with `items-start` the 44px buttons hung below a 22px cap height
       and added a row's worth of air on their own. */
    <header className="px-4 pb-1 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
            Food Feed
          </h1>
          {/* The caller owns the words — the screen passes a mono count string.
              Styled here so every subtitle this header is given lands in the
              same voice: a count is a machine value, and it sits on the cream
              ground, so --pm-grey-text rather than zinc-500 (which is 4.28:1
              there and fails). */}
          {subtitle && (
            <p className="mt-1 font-mono text-xs tabular-nums text-pm-grey-text">{subtitle}</p>
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
          {loading ? (
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-full bg-pm-grey-tint"
            />
          ) : isSignedIn && account ? (
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
          ) : (
            <Link
              href="/m/account"
              className="flex min-h-11 shrink-0 items-center rounded-full bg-pm-grey-tint px-3.5 text-[13px] font-medium text-pm-grey-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

    </header>
  );
}

/* The search glyph that used to live here went with the search control — see
   PhoneFeedSearch, which now owns both. */
