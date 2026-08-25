"use client";


/**
 * The feed screen's header: a count, and nothing else. It carried a "Food
 * Feed" title until that came off, and a plate-points chip and profile avatar
 * on the right until those came off too — see the notes at their old
 * positions.
 *
 * Same voice as the discover screen's (`src/app/m/page.tsx`): it sits directly
 * on the cream ground rather than on a card, the count line is mono because it
 * is a count, and the whole thing scrolls away
 * rather than sticking — a 390px screen has roughly 640 usable points of height
 * and the nav already owns the bottom ~96 of them.
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
  /* Nothing to say, so nothing drawn — not an empty bar with padding in it.
     The count is now the only thing this header can hold, so its absence is
     the whole test. The plate-points chip and the profile avatar used to keep
     the row alive when there was no subtitle, which meant a bar of padding
     above the tabs on every screen that passes none; the nav's Profile tab is
     already the way to an account and it does not need saying twice. */
  if (!subtitle) return null;

  return (
    /* Tight on purpose. This header sits above a map that wants the whole
       screen, so every point it spends is a point the map doesn't get:
       `pt-2 pb-1` rather than `pt-4 pb-2`. With the 44px avatar gone the row
       is the count's own line height and nothing more, which is as tight as
       this can get without taking the padding off the ground it sits on. */
    <header className="px-4 pb-1 pt-2">
      {/* No title. It read "Food Feed" over a feed you are already looking at,
          on the one screen the nav's Feed tab has already named — a label for
          a place nobody could be lost in. The subtitle stays because it
          carries a count, which the title never did.

          Nothing opposite it any more either. The plate-points chip and the
          profile avatar sat on the right until both came off; the avatar was a
          min-h-11 tap target, so it — not the 12px count beside it — was what
          set this header's height, and the tabs and the feed under it were
          being pushed down by a control the nav already carries. What is left
          is one line of mono, and everything below it moves up by the
          difference.

          The caller owns those words; styled here so every subtitle this
          header is given lands in the same voice: a count is a machine value,
          and it sits on the cream ground, so --pm-grey-text rather than
          zinc-500 (4.28:1 there, and it fails). */}
      <p className="font-mono text-xs tabular-nums text-pm-grey-text">{subtitle}</p>
    </header>
  );
}

/* The search glyph that used to live here went with the search control — see
   PhoneFeedSearch, which now owns both. */
