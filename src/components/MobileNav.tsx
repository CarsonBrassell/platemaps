"use client";

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

/**
 * Destination → first-run walkthrough anchor. See CoachTour.tsx.
 *
 * Keyed by href rather than by label so the three navs that render these
 * destinations — this bar, the header row and `PhoneNav` — can be marked from
 * their own route tables without agreeing on anything but the URL.
 */
export const COACH_KEYS: Record<string, string | undefined> = {
  "/feed": "feed",
  "/": "discover",
  "/friends": "friends",
  "/account": "profile",
  "/m/feed": "feed",
  "/m": "discover",
  "/m/friends": "friends",
  "/m/account": "profile",
};

export function MobileNav({ alerts }: { alerts: NavAlerts }) {
  const pathname = usePathname();

  const slot = ({ href, label, Icon, ...rest }: Slot) => {
    const dot = "dot" in rest ? rest.dot : undefined;
    /* Prefix match so a slot stays lit on its own sub-screens — /account/settings
       is Profile. "/" is excluded from the prefix arm: it is the root, and a
       bare startsWith would light Discover everywhere. Same rule the header row
       and PhoneNav follow. */
    const current = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? "page" : undefined}
        /* Anchors for the first-run walkthrough. Marked here rather than in
           the tour, which finds its targets in the live DOM — see
           CoachTour.tsx. Keyed off the destination so the header row, this bar
           and the phone nav can all carry the same marks. */
        data-coach={COACH_KEYS[href]}
        /* Small text, so the accent uses its darker voice (DESIGN.md). */
        className={`${SLOT} ${current ? "text-pm-orange-text" : "text-zinc-500"}`}
      >
        <span className="relative">
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
          data-coach="post"
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
