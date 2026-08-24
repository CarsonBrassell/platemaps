"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavAlerts } from "@/lib/navAlerts";
import { NavDot } from "@/components/NavDot";
import { HomeIcon, CompassIcon, UsersIcon, UserIcon, PlusIcon } from "@/components/icons";

/**
 * The phone and tablet counterpart to the header's nav row, which is hidden
 * below `xl`. The two breakpoints must stay in lockstep — this is `xl:hidden`
 * and the header row is `xl:flex` — so exactly one of them is ever on screen.
 * The handoff has moved outward twice for the same reason: first sm → lg, when
 * the header row was too narrow to hold the nav oval and it overlapped the
 * brand, then lg → xl, when the compose button gained the label "Post a plate"
 * and the row grew from 364px to 553px. Also keep `globals.css`'s bottom-padding
 * media query on the same number — it buys back the space this bar covers.
 *
 * Same five slots in the same order — Feed, Discover, create, Friends, Profile
 * — so the two are one menu wearing different clothes for the reach they have
 * to serve: a thumb at the bottom of a phone, a cursor at the top of a desktop.
 *
 * Measurements follow the bar archived in `archive/nav/MobileNavigation.tsx`:
 * 56px rows, 24px icons, 11px labels, a 56px orange circle in the centre slot,
 * and `env(safe-area-inset-bottom)` so the row clears the iOS home indicator.
 * Deliberately taller than the 44px control floor — down here this is the only
 * navigation on the page, so it reads as a surface rather than a strip.
 */

const SLOT =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange";

/* `dot` names the useNavAlerts slot this row watches, and what the dot says out
   loud. Same two slots as the header — the two menus are one menu. */
const LEFT = [
  { href: "/feed", label: "Feed", Icon: HomeIcon },
  { href: "/", label: "Discover", Icon: CompassIcon },
];
const RIGHT = [
  {
    href: "/friends",
    label: "Friends",
    Icon: UsersIcon,
    dot: { slot: "friends", label: "You have friend requests waiting" },
  },
  {
    href: "/account",
    label: "Profile",
    Icon: UserIcon,
    dot: { slot: "profile", label: "You have new activity on your plates" },
  },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof UsersIcon;
  dot: { slot: keyof NavAlerts; label: string };
}>;

type Slot = (typeof LEFT)[number] | (typeof RIGHT)[number];

export function MobileNav({ alerts }: { alerts: NavAlerts }) {
  const pathname = usePathname();
  /* Which slot was last tapped, and how many taps ago in this session. The
     counter is what makes the kick repeatable: the icon is keyed on it, so a
     tap remounts the span and the animation runs from the top even when the
     class was already there. That is this codebase's existing way of
     re-firing a CSS animation — see PercentMeter's `pct-kick`.

     Driven by the tap rather than by `current` flipping, which matters in two
     places. Tapping the tab you are already on still animates, where a
     route-change trigger would sit there doing nothing and read as a dead
     control. And nothing kicks on first paint, where a route-change trigger
     would pop whichever tab the page happened to load on. */
  const [tap, setTap] = useState({ href: "", n: 0 });

  const slot = ({ href, label, Icon, ...rest }: Slot) => {
    const dot = "dot" in rest ? rest.dot : undefined;
    const current = pathname === href;
    const kicking = tap.href === href && tap.n > 0;
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setTap((prev) => ({ href, n: prev.n + 1 }))}
        aria-current={current ? "page" : undefined}
        /* Small text, so the accent uses its darker voice (DESIGN.md). */
        className={`${SLOT} ${current ? "text-pm-orange-text" : "text-zinc-500"}`}
      >
        <span key={kicking ? tap.n : "rest"} className={`relative ${kicking ? "nav-kick" : ""}`}>
          <Icon className="h-6 w-6" />
          {dot && alerts[dot.slot] && (
            <NavDot label={dot.label} className="absolute -right-1 -top-0.5" />
          )}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      /* An overlay edge, not a grouping border — content scrolls under this. */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm xl:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-2">
        {LEFT.map(slot)}
        <Link
          href="/post"
          aria-label="Create post"
          className="flex min-h-14 flex-1 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC] transition-transform active:scale-95">
            <PlusIcon className="h-6 w-6" />
          </span>
        </Link>
        {RIGHT.map(slot)}
      </div>
    </nav>
  );
}
