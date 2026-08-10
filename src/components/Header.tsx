"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useNavAlerts } from "@/lib/navAlerts";
import { initials } from "@/lib/format";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { RestaurantSearch } from "@/components/RestaurantSearch";
import { MobileNav } from "@/components/MobileNav";
import { NavDot } from "@/components/NavDot";
import { PlusIcon } from "@/components/icons";

/* Split in two so the compose button can sit in the middle of the oval rather
   than hanging off one end — posting is the one thing this row exists to
   invite, and the centre is the only position that doesn't rank it against the
   places you browse. */
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
  const { account, isSignedIn } = useAuth();

  /* The unread dots on Friends and Profile. This is the only place in the app
     that surfaces either outside its own page — the request badge used to live
     on the side rail's Profile row, which went away with the rail. */
  const alerts = useNavAlerts();

  const navPill = (link: { href: string; label: string }) => {
    const current = pathname === link.href;
    const dot = DOTS[link.href];
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={current ? "page" : undefined}
        className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-4 transition-[color,background-color,scale] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange xl:px-5 ${
          current
            ? "bg-pm-orange font-medium text-[#F7F4EC]"
            : "text-pm-grey-text hover:text-zinc-900 motion-safe:hover:scale-105"
        }`}
      >
        {link.label}
        {dot && alerts[dot.slot] && <NavDot label={dot.label} className="ml-1.5 self-start" />}
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

        The two side groups are then deliberately massed to match — brand+city
        ≈ search+avatar — which is what makes the gaps either side of the nav
        equal. Moving weight between them breaks the symmetry, not the centring.

        The grid starts at lg because that is where the row can actually hold a
        centred 364px oval: equal columns need 2×(brand+city) + oval + gutters,
        which does not fit until ~1024. Below lg the oval is hidden in favour of
        MobileNav and this is a plain two-end flex row. */}
    <header className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {/* min-w-0 so this group yields when the row gets tight rather than
          shoving the nav off centre. */}
      <div className="flex min-w-0 items-center gap-4">
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
        {/* The city is a machine value: monospace, quiet. Sits with the brand
            because the product is scoped to one city — "PlateMaps, San Diego"
            reads as one thought, and it gives the left group enough mass to
            balance the search on the right. */}
        {/* lg and up only. It is whitespace-nowrap and cannot shrink, so
            between sm and lg — where the nav oval is already showing but the
            row is still narrow — it collided with the nav. */}
        <span className="mono-label hidden whitespace-nowrap text-zinc-500 lg:block">
          San Diego, CA
        </span>
      </div>
      {/* Top-level navigation wears the pill treatment (design swapped with
          the feed's tab bar): an oval tan track encasing the pills, the page
          you're on filled orange, unselected pills growing slightly on
          hover. */}
      {/* The oval grows at xl, not lg. It is the grid's `auto` column, so extra
          width comes straight out of both side gaps — which are only 6px and
          20px at 1024, where the row is already full. From 1280 up there is
          130px+ a side to spend. */}
      <nav className="hidden shrink-0 items-center rounded-full bg-pm-grey-tint p-1.5 text-sm lg:flex xl:p-2">
        {NAV_LEFT.map(navPill)}
        {/* The compose button. Orange because posting is the primary action,
            and a circle rather than a pill so it reads as the one control here
            that does something instead of going somewhere. */}
        <Link
          href="/post"
          aria-label="Create post"
          className="-my-0.5 mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC] transition-[scale,filter] duration-200 ease-out hover:brightness-105 active:scale-95 motion-safe:hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 xl:mx-2.5"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
        {NAV_RIGHT.map(navPill)}
      </nav>
      {/* Massed to match the left group so the nav stays between equal gaps —
          the search is the bulk of it, which is why its width is pinned rather
          than elastic. justify-end keeps the avatar on the right edge. */}
      <div className="flex min-w-0 items-center justify-end gap-4">
        <RestaurantSearch />
        {/* Duplicates the nav's Profile pill as a route to /account, but keeps a
            full-size target and an accessible name rather than being a 36px
            decoration that happens to be clickable. */}
        <Link
          href="/account"
          aria-label={isSignedIn && account ? `Your account, ${account.name}` : "Sign in"}
          aria-current={pathname === "/account" ? "page" : undefined}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {isSignedIn && account?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatarUrl}
              alt=""
              className={`h-9 w-9 shrink-0 rounded-full object-cover transition-transform hover:scale-105 ${
                pathname === "/account" ? "ring-2 ring-pm-orange ring-offset-2" : ""
              }`}
            />
          ) : (
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text transition-transform hover:scale-105 ${
                pathname === "/account" ? "ring-2 ring-pm-orange ring-offset-2" : ""
              }`}
            >
              {isSignedIn && account ? initials(account.name) : "?"}
            </div>
          )}
        </Link>
      </div>
    </header>
    {/* Rendered here rather than in each page: Header is already on all of
        them, so this keeps the two halves of one menu in one file. */}
    <MobileNav alerts={alerts} />
    </>
  );
}
