"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NavDot } from "@/components/NavDot";
import { useNavAlerts } from "@/lib/navAlerts";
import { HomeIcon, CompassIcon, UsersIcon, UserIcon, PlusIcon } from "@/components/icons";

/**
 * The phone version's primary navigation, in three treatments you can switch
 * between with `?nav=`.
 *
 * Three rather than one because this is the control the whole phone version is
 * organised around and it is cheaper to compare them side by side on a real
 * handset than to argue about them. Same pattern the map-search drafts in
 * `components/drafts/` already established here. Once one wins, delete the
 * other two and the switcher with them — this is scaffolding, not a feature.
 *
 * All three carry the SAME five slots in the SAME order as the web header and
 * `MobileNav`: Feed, Discover, create, Friends, Profile. That ordering is not
 * up for redesign per variant — a person moving between the two versions of the
 * site should not have to relearn where Friends lives. What varies is only the
 * clothing.
 *
 * Why not just reuse `MobileNav`: it is the *web* layout's small-screen
 * fallback, sized to hand off to a desktop header at `xl` and wired to the web
 * routes. Down here there is no desktop to hand off to and the routes are the
 * `/m` tree, so the two would fight over the same fixed bottom strip.
 */

export type NavVariant = "arc" | "pill" | "strip";

export const NAV_VARIANTS: readonly NavVariant[] = ["arc", "pill", "strip"];

/** Chosen 12 Aug 2026. `pill` and `strip` are kept only until the runners-up
    are formally cut — nothing should be built on top of them. */
export const DEFAULT_VARIANT: NavVariant = "arc";

export function parseNavVariant(raw: string | string[] | undefined): NavVariant {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return NAV_VARIANTS.includes(value as NavVariant) ? (value as NavVariant) : DEFAULT_VARIANT;
}

/* `dot` names the useNavAlerts slot the row watches, same two slots the web
   header and MobileNav watch. One alert model, three renderings. */
type Slot = {
  href: string;
  label: string;
  Icon: typeof UsersIcon;
  dot?: { slot: "friends" | "profile"; label: string };
};

const SLOTS: readonly Slot[] = [
  { href: "/m/feed", label: "Feed", Icon: HomeIcon },
  { href: "/m", label: "Discover", Icon: CompassIcon },
  {
    href: "/m/friends",
    label: "Friends",
    Icon: UsersIcon,
    dot: { slot: "friends", label: "You have friend requests waiting" },
  },
  {
    href: "/m/account",
    label: "Profile",
    Icon: UserIcon,
    dot: { slot: "profile", label: "You have new activity on your plates" },
  },
];

/** Where the create button goes. Held out of SLOTS because every variant puts
    it somewhere different — inside the row, above it, or centred in it. */
const CREATE = { href: "/m/post", label: "Post a plate" };

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function PhoneNav({ variant = DEFAULT_VARIANT }: { variant?: NavVariant }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const alerts = useNavAlerts();

  /* The variant travels in the URL, so every in-nav link has to carry it or the
     first tap throws you back to the default and the comparison is over. Drop
     this when the switcher goes. */
  const nav = params.get("nav");
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  const isCurrent = (href: string) => pathname === href;

  const dotFor = (slot: Slot) =>
    slot.dot && alerts[slot.dot.slot] ? (
      <NavDot label={slot.dot.label} className="absolute -right-1 -top-0.5" />
    ) : null;

  const shared = { to, isCurrent, dotFor };

  if (variant === "strip") return <StripNav {...shared} />;
  if (variant === "pill") return <PillNav {...shared} />;
  return <ArcNav {...shared} />;
}

type VariantProps = {
  to: (href: string) => string;
  isCurrent: (href: string) => boolean;
  dotFor: (slot: Slot) => React.ReactNode;
};

/* ---------------------------------------------------------------------------
 * pill — a floating charcoal capsule, active slot expands to name itself.
 *
 * The one that takes DESIGN.md's "pills everywhere, but ranked" literally and
 * applies it to the nav itself. Charcoal rather than white because a floating
 * element needs to separate from the ground and the house style forbids
 * shadows — value contrast against the cream does the job a shadow would, so
 * the rule costs nothing here.
 *
 * Only the current slot spends space on a label. Four labels at 11px is the
 * strip's approach and it makes every slot shout equally; showing one means the
 * row answers "where am I" before it answers "where could I go", which is the
 * question you actually have when you glance at a nav.
 * ------------------------------------------------------------------------ */
function PillNav({ to, isCurrent, dotFor }: VariantProps) {
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-pm-charcoal p-1.5">
        {SLOTS.slice(0, 2).map((slot) => (
          <PillSlot key={slot.href} slot={slot} to={to} isCurrent={isCurrent} dotFor={dotFor} />
        ))}

        <Link
          href={to(CREATE.href)}
          aria-label={CREATE.label}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC] transition-transform active:scale-90 ${FOCUS}`}
        >
          <PlusIcon className="h-5 w-5" />
        </Link>

        {SLOTS.slice(2).map((slot) => (
          <PillSlot key={slot.href} slot={slot} to={to} isCurrent={isCurrent} dotFor={dotFor} />
        ))}
      </div>
    </nav>
  );
}

function PillSlot({
  slot,
  to,
  isCurrent,
  dotFor,
}: VariantProps & { slot: Slot }) {
  const current = isCurrent(slot.href);
  return (
    <Link
      href={to(slot.href)}
      aria-current={current ? "page" : undefined}
      /* min-h-11 keeps the 44px target floor even though the pill reads shorter
         than the 56px rows MobileNav uses — the padding is inside the capsule. */
      className={`flex min-h-11 items-center gap-2 rounded-full px-3 transition-colors ${FOCUS} ${
        current ? "bg-pm-orange/15 text-pm-orange" : "text-zinc-400"
      }`}
    >
      <span className="relative">
        <slot.Icon className="h-[22px] w-[22px]" />
        {dotFor(slot)}
      </span>
      {/* Labels are machine-voice small caps per DESIGN.md, and only the current
          slot prints one. `hidden` rather than width-animated: an animated
          capsule that reflows four siblings on every tap is a lot of motion to
          buy one flourish, and it fights prefers-reduced-motion. */}
      {current && <span className="mono-label pr-1">{slot.label}</span>}
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * strip — the conservative one: MobileNav's edge-to-edge bar, restated.
 *
 * Here as the control. It is what the site already does on a small screen, so
 * if a fancier treatment cannot beat it the honest answer is to keep it and
 * spend the effort elsewhere. Differences from MobileNav are deliberate and
 * small: cream rather than white so it belongs to the ground rather than
 * floating a second surface over it, and the active slot wears the header's own
 * orange-bullet mark (AGENTS.md) instead of only turning orange, so the two
 * navs agree on what "current" looks like.
 * ------------------------------------------------------------------------ */
function StripNav({ to, isCurrent, dotFor }: VariantProps) {
  const slot = (item: Slot) => {
    const current = isCurrent(item.href);
    return (
      <Link
        key={item.href}
        href={to(item.href)}
        aria-current={current ? "page" : undefined}
        className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${FOCUS} ${
          current ? "text-pm-orange-text" : "text-zinc-500"
        }`}
      >
        {/* The header's 5px orange bullet, moved to the top edge of the slot. */}
        {current && (
          <span
            className="absolute top-0 h-[5px] w-[5px] rounded-full bg-pm-orange"
            aria-hidden="true"
          />
        )}
        <span className="relative">
          <item.Icon className="h-6 w-6" />
          {dotFor(item)}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-[#F7F4EC]/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-2">
        {SLOTS.slice(0, 2).map(slot)}
        <Link
          href={to(CREATE.href)}
          aria-label={CREATE.label}
          className={`flex min-h-14 flex-1 items-center justify-center ${FOCUS}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC] transition-transform active:scale-95">
            <PlusIcon className="h-6 w-6" />
          </span>
        </Link>
        {SLOTS.slice(2).map(slot)}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
 * arc — tan bar, create button raised out of the row.
 *
 * The middle position: a grounded bar like `strip`, but the primary action
 * breaks the top edge instead of sitting in line, which is the one thing the
 * flat row genuinely gives up. "Post a plate" is the only orange pill in the
 * web header for the same reason — it is the one action the product wants, and
 * in a row of five equals it reads as a fifth equal.
 *
 * The cost is honest: the raised circle overlaps content above the bar, so the
 * page has to reserve more bottom space than the bar's own height. That is what
 * `--phone-nav-space` in phone.css pays for.
 * ------------------------------------------------------------------------ */
function ArcNav({ to, isCurrent, dotFor }: VariantProps) {
  /* Same tap kick MobileNav's slots wear, and deliberately the same one: a
     person moving between the two versions of the site should not have to
     relearn what a tap feels like any more than they have to relearn where
     Friends lives. State is local to this variant rather than lifted into
     PhoneNav because `pill` and `strip` are runners-up awaiting deletion —
     nothing new should be built on top of them. See `nav-kick` in globals.css
     for why the keyframe starts below 1 and why only the icon carries it. */
  const [tap, setTap] = useState({ href: "", n: 0 });

  const slot = (item: Slot) => {
    const current = isCurrent(item.href);
    const kicking = tap.href === item.href && tap.n > 0;
    return (
      <Link
        key={item.href}
        href={to(item.href)}
        onClick={() => setTap((prev) => ({ href: item.href, n: prev.n + 1 }))}
        aria-current={current ? "page" : undefined}
        className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${FOCUS} ${
          current ? "text-pm-orange-text" : "text-pm-grey-text"
        }`}
      >
        <span key={kicking ? tap.n : "rest"} className={`relative ${kicking ? "nav-kick" : ""}`}>
          <item.Icon className="h-[22px] w-[22px]" />
          {dotFor(item)}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto relative mx-auto max-w-lg rounded-full bg-pm-grey-tint px-2 py-1.5">
        {/* Raised, and centred on the bar's own top edge rather than the
            viewport — the bar is inset, so those are not the same line. */}
        <Link
          href={to(CREATE.href)}
          aria-label={CREATE.label}
          className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full ${FOCUS}`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#F7F4EC] bg-pm-orange text-[#F7F4EC] transition-transform active:scale-95">
            <PlusIcon className="h-6 w-6" />
          </span>
        </Link>

        <div className="flex items-stretch">
          {SLOTS.slice(0, 2).map(slot)}
          {/* Holds the gap the raised button sits in. */}
          <div className="w-16 shrink-0" aria-hidden="true" />
          {SLOTS.slice(2).map(slot)}
        </div>
      </div>
    </nav>
  );
}
