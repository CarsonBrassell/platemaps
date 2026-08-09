"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { BrandMark, WordMark } from "@/components/BrandMark";
import { RestaurantSearch } from "@/components/RestaurantSearch";
import { MobileNav } from "@/components/MobileNav";
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

export function Header() {
  const pathname = usePathname();
  const { account, isSignedIn } = useAuth();

  /* Incoming friend requests, shown as a dot on Friends.
   *
   * This is the only place in the app that surfaces a pending request outside
   * /friends itself — it used to be a badge on the side rail's Profile row,
   * which went away with the rail. A dot rather than a number on purpose: the
   * count isn't the point, and a bare integer next to "Friends" reads as a
   * friend count, which this product never displays. */
  const [hasRequests, setHasRequests] = useState(false);

  useEffect(() => {
    // No reset branch on sign-out: the dot's render is gated on isSignedIn
    // below, so a stale true from a previous session is simply never read.
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/friends")
      .then((res) => res.json())
      .then((data: { incoming?: unknown[] }) => {
        if (!cancelled) setHasRequests((data.incoming?.length ?? 0) > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-read on navigation so answering a request clears the dot.
  }, [isSignedIn, pathname]);

  const navPill = (link: { href: string; label: string }) => {
    const current = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={current ? "page" : undefined}
        className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-4 transition-[color,background-color,scale] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
          current
            ? "bg-pm-orange font-medium text-[#F7F4EC]"
            : "text-pm-grey-text hover:text-zinc-900 motion-safe:hover:scale-105"
        }`}
      >
        {link.label}
        {link.href === "/friends" && isSignedIn && hasRequests && (
          <span
            aria-label="You have friend requests waiting"
            role="status"
            className="ml-1.5 h-1.5 w-1.5 shrink-0 self-start rounded-full bg-pm-orange"
          />
        )}
      </Link>
    );
  };

  return (
    <>
    {/* Sits directly on the cream ground — the header is not a card. */}
    <header className="flex items-center justify-between gap-5 px-5 py-4 sm:px-6">
      {/* min-w-0 so the search yields first when the row gets tight — the nav
          and the avatar are fixed-size, so without it the search runs under
          the nav instead of narrowing. */}
      <div className="flex min-w-0 items-center gap-5">
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
        <RestaurantSearch />
      </div>
      {/* Top-level navigation wears the pill treatment (design swapped with
          the feed's tab bar): an oval tan track encasing the pills, the page
          you're on filled orange, unselected pills growing slightly on
          hover. */}
      <nav className="hidden shrink-0 items-center rounded-full bg-pm-grey-tint p-1.5 text-sm sm:flex">
        {NAV_LEFT.map(navPill)}
        {/* The compose button. Orange because posting is the primary action,
            and a circle rather than a pill so it reads as the one control here
            that does something instead of going somewhere. */}
        <Link
          href="/post"
          aria-label="Create post"
          className="-my-0.5 mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC] transition-[scale,filter] duration-200 ease-out hover:brightness-105 active:scale-95 motion-safe:hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          <PlusIcon className="h-5 w-5" />
        </Link>
        {NAV_RIGHT.map(navPill)}
      </nav>
      <div className="flex shrink-0 items-center gap-4">
        {/* The city is a machine value: monospace, quiet. */}
        <span className="mono-label hidden whitespace-nowrap text-zinc-500 sm:block">
          San Diego, CA
        </span>
        {/* The only route to /account now that the nav row dropped it, so it
            carries a real label and a full-size target rather than being a
            36px decoration that happens to be clickable. */}
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
    <MobileNav hasRequests={isSignedIn && hasRequests} />
    </>
  );
}
