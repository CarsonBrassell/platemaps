"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, CompassIcon, UsersIcon, UserIcon, PlusIcon } from "@/components/icons";

/**
 * The phone counterpart to the header's pill nav, which is hidden below `sm`.
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

const LEFT = [
  { href: "/feed", label: "Feed", Icon: HomeIcon },
  { href: "/", label: "Discover", Icon: CompassIcon },
];
const RIGHT = [
  { href: "/friends", label: "Friends", Icon: UsersIcon },
  { href: "/account", label: "Profile", Icon: UserIcon },
];

export function MobileNav({ hasRequests }: { hasRequests: boolean }) {
  const pathname = usePathname();

  const slot = ({ href, label, Icon }: (typeof LEFT)[number]) => {
    const current = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? "page" : undefined}
        /* Small text, so the accent uses its darker voice (DESIGN.md). */
        className={`${SLOT} ${current ? "text-pm-orange-text" : "text-zinc-500"}`}
      >
        <span className="relative">
          <Icon className="h-6 w-6" />
          {href === "/friends" && hasRequests && (
            <span
              aria-label="You have friend requests waiting"
              role="status"
              className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-pm-orange"
            />
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm sm:hidden"
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
