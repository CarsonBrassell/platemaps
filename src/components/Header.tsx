"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavAlerts } from "@/lib/navAlerts";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { RestaurantSearch } from "@/components/RestaurantSearch";
import { MobileNav, COACH_KEYS } from "@/components/MobileNav";
import { NavDot } from "@/components/NavDot";
import { PlusIcon } from "@/components/icons";

/* Still split in two so the compose button sits in the middle of the row
   rather than hanging off one end — posting is the one thing this row exists
   to invite, and the centre is the only position that doesn't rank it against
   the places you browse. The tan oval that used to hold them is gone; the
   split survives it. */
const NAV_LEFT = [
  { href: "/feed", label: "Feed" },
  { href: "/", label: "Discover" },
];
const NAV_RIGHT = [
  { href: "/friends", label: "Friends" },
  { href: "/account", label: "Profile" },
];

/* Which nav slot each dot belongs to, and what it says out loud. Only these
   two carry one: they are the only slots whose content arrives without you
   doing anything. Feed and Discover change constantly and a permanent dot on
   them would mean nothing. */
const DOTS: Record<string, { slot: "friends" | "profile"; label: string }> = {
  "/friends": { slot: "friends", label: "You have friend requests waiting" },
  "/account": { slot: "profile", label: "You have new activity on your plates" },
};

export function Header() {
  const pathname = usePathname();

  /* The unread dots on Friends and Profile. This is the only place in the app
     that surfaces either outside its own page — the request badge used to live
     on the side rail's Profile row, which went away with the rail. */
  const alerts = useNavAlerts();

  /* Nav items are mono section labels — the same voice as THE HITS and FULL
     MENU — rather than pills. "You are here" is carried by the 5px orange
     bullet plus the accent's small-text voice, not by a filled shape.

     Two contrast notes, both load-bearing:
     - `text-pm-grey-text` (#665C4E), not zinc-500. DESIGN.md's zinc-500 clears
       4.5:1 on *white*; this row sits on the cream ground, where it only makes
       4.28:1 and fails at 11px. #665C4E makes 5.96:1 on cream.
     - The bullet is decorative and hidden from screen readers: `aria-current`
       already states the same thing, and colour is never the sole indicator
       because the label's own colour changes with it.

     Weight is deliberately not part of the active state. `.mono-label` lives
     unlayered in globals.css, so it outranks Tailwind's layered `font-*`
     utilities and any weight set here would be silently dropped. */
  const navItem = (link: { href: string; label: string }) => {
    /* Prefix match so a slot stays lit on its own sub-screens — /account/settings
       is Profile. "/" is excluded from the prefix arm: it is the root, and a
       bare startsWith would light Discover on every page. Same rule MobileNav
       and PhoneNav follow. */
    const current =
      pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`));
    const dot = DOTS[link.href];
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={current ? "page" : undefined}
        /* First-run walkthrough anchors — see CoachTour.tsx. The mobile bar
           carries the same marks; whichever row is on screen is the one the
           tour finds. */
        data-coach={COACH_KEYS[link.href]}
        className={`mono-label inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-2.5 transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          current ? "text-pm-orange-text" : "text-pm-grey-text hover:bg-pm-grey-tint hover:text-zinc-900"
        }`}
      >
        <span
          aria-hidden
          className={`h-[5px] w-[5px] shrink-0 rounded-full transition-colors duration-200 ${
            current ? "bg-pm-orange" : "bg-transparent"
          }`}
        />
        {link.label}
        {dot && alerts[dot.slot] && <NavDot label={dot.label} className="ml-0.5" />}
      </Link>
    );
  };

  return (
    <>
    {/* Sits directly on the cream ground — the header is not a card.

        Three equal-width columns from lg up (`minmax(0,1fr) auto
        minmax(0,1fr)`) rather than `justify-between`, so the nav oval lands on
        the page's true centre line instead of being centred in whatever space
        the side groups leave over. With justify-between it sat ~118px right of
        centre, because the left group outweighed the right one. The explicit
        `minmax(0,…)` matters: a bare `1fr` floors at min-content, so a wide
        side group would silently make the columns unequal and pull the nav off
        centre again.

        The two side groups were then deliberately massed to match — brand+city
        ≈ search+avatar — which is what made the gaps either side of the nav
        equal. The avatar has since gone (see the right column below), so the
        right group is the lighter of the two by about 52px. That shifts the
        symmetry, not the centring: the columns are still equal and the nav is
        still on the page's centre line (measured at 1400px), so what changed
        is how much cream trails the search, not where the menu sits.

        The grid starts at xl, not lg. Equal columns need 2×(brand+city) + the
        nav + gutters, and the nav row is 553px now that it carries a named
        compose button instead of a 44px circle — measured, that wants 1259px
        of viewport. It used to be a 364px oval, which is why this sat at lg;
        the label is what moved it. Below xl the row is hidden in favour of
        MobileNav and this is a plain two-end flex row. */}
    <header className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6 xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {/* min-w-0 so this group yields when the row gets tight rather than
          shoving the nav off centre. */}
      <div className="flex min-w-0 flex-col items-start">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-lg text-[22px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pm-orange"
        >
          <BrandMark
            tone="dark"
            className="logo-bob h-[60px] w-[60px] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          />
          <WordMark tone="dark" />
        </Link>
        {/* The city is a machine value: monospace, quiet. It belongs to the
            brand, not to the menu — the product is scoped to one city and
            "PlateMaps, San Diego" is one thought. Set beside the wordmark it
            sat on the nav's own baseline and read as a fifth destination, so it
            is stacked under the wordmark instead: `pl-[70px]` puts it past the
            60px mark and its 10px gap so it hangs off the name rather than the
            pin, and the negative top margin pulls it back inside the mark's
            60px band so the row height is unchanged.

            Deliberately outside the Link: it is not part of the accessible
            name of the home link. */}
        {/* xl and up only, in step with the nav. It is whitespace-nowrap and
            cannot shrink, so at any width where the nav row is showing but the
            header is still narrow, it collides with the nav. */}
        <span className="mono-label -mt-[13px] hidden whitespace-nowrap pl-[70px] text-zinc-500 xl:block">
          San Diego, CA
        </span>
      </div>
      {/* Top-level navigation sits directly on the cream — no track, no fill.
          The tan oval is gone: grouping here is the row's own rhythm, and the
          only coloured thing left is the compose circle.

          Still the grid's `auto` column, now `xl:flex` in lockstep with
          MobileNav's `xl:hidden` (see MobileNav's header comment) — exactly one
          of the two is ever on screen. The handoff moved lg → xl when the
          compose button gained its label: the row measures 553px against the
          oval's 364px, which over-subscribed a 1024px header by 235px. */}
      {/* What holds the five slots together is proximity, not an edge. A tan
          rule under the group was tried and removed: it spanned only the nav,
          so it began and ended in cream and read as a stray underline, and at
          `--pm-grey-tint` on `--background` (~1.1:1) it was too faint to look
          deliberate anyway. More to the point, grouping by outline is the one
          thing this design system rules out — see the Shape section.

          So the spacing does the work. Slots sit `px-2.5` apart (20px between
          labels, tight enough to read as one run) while the grid leaves 100px+
          of cream between the nav and the brand and search either side. Near
          things group; far things separate. Nothing is drawn.

          No vertical padding: the bare 44px slots centre in the 60px row at
          the same y as the wordmark and the search field. */}
      <nav aria-label="Main" className="hidden shrink-0 items-center xl:flex">
        {NAV_LEFT.map(navItem)}
        {/* The compose button, named rather than left as a bare glyph. Orange
            because posting is the primary action, and the only filled shape in
            a row that is otherwise plain type — that contrast is what marks it
            as the one control here that does something instead of going
            somewhere.

            Its label is sans, not mono, and that is the type rule rather than
            an oversight: DESIGN.md splits the voices by who wrote the text, and
            a button label is human prose. It also keeps the label off the
            worst contrast pairing in the app — cream on orange is 3.87:1, which
            is fine at this 14px weight (the same pairing the selected pill used
            to ship) and would be indefensible at the 11px the mono labels use.

            Focus ring is ink, not orange: an orange ring on an orange fill
            would not be visible. */}
        <Link
          href="/post"
          data-coach="post"
          className="mx-2.5 flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] transition-[scale,filter] duration-200 ease-out hover:brightness-105 active:scale-95 motion-safe:hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <PlusIcon className="h-4 w-4 shrink-0" />
          Post a plate
        </Link>
        {NAV_RIGHT.map(navItem)}
      </nav>
      {/* The right column, and the search is now all of it.

          An avatar disc used to sit on the right edge here, a second route to
          /account alongside the nav's own Profile slot. Two controls going to
          one screen is one control and a decoration, and the nav is the half
          that carries a label, an accessible name and the activity dot — so
          the disc is the half that went. Signed out it was a `?` in a circle,
          which was never a doorway anybody read as "sign in" anyway.

          That leaves the right column ~52px lighter than the brand+city group
          it is massed against. Measured at 1400px the nav is still exactly on
          the page centre line — the equal `minmax(0,1fr)` columns see to that,
          which is the whole reason they are not `justify-between` — so what
          changed is only how much cream trails the search, not where the menu
          sits. If it ever reads unbalanced, give the search back the width;
          don't put an ornament in the corner to weigh the scales. */}
      <div className="flex min-w-0 items-center justify-end">
        <RestaurantSearch />
      </div>
    </header>
    {/* Rendered here rather than in each page: Header is already on all of
        them, so this keeps the two halves of one menu in one file. */}
    <MobileNav alerts={alerts} />
    </>
  );
}
