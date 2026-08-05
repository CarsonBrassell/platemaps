"use client";

import Link from "next/link";
import { HomeIcon, CompassIcon, TrophyIcon, BookmarkIcon, PlusIcon } from "@/components/icons";
import type { NavKey } from "./SideNav";

const tab =
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange";

/**
 * Sticky bottom bar for small screens. Sits above the iOS home indicator via
 * env(safe-area-inset-bottom) so the last row of the feed stays reachable.
 */
export function MobileNavigation({
  activeKey,
  onNavigate,
  onCreate,
}: {
  activeKey: NavKey;
  onNavigate: (key: Extract<NavKey, "home" | "saved" | "leaderboard">) => void;
  onCreate: () => void;
}) {
  const tone = (on: boolean) => (on ? "text-pm-orange-text" : "text-zinc-500");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          aria-current={activeKey === "home" ? "page" : undefined}
          className={`${tab} ${tone(activeKey === "home")}`}
        >
          <HomeIcon className="h-5 w-5" />
          Home
        </button>

        <Link href="/" className={`${tab} ${tone(activeKey === "explore")}`}>
          <CompassIcon className="h-5 w-5" />
          Explore
        </Link>

        <button
          type="button"
          onClick={onCreate}
          aria-label="Create post"
          className="flex min-h-11 flex-1 items-center justify-center"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pm-orange text-white shadow-md transition-transform active:scale-95">
            <PlusIcon className="h-5 w-5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate("leaderboard")}
          className={`${tab} ${tone(false)}`}
        >
          <TrophyIcon className="h-5 w-5" />
          Ranks
        </button>

        <button
          type="button"
          onClick={() => onNavigate("saved")}
          aria-current={activeKey === "saved" ? "page" : undefined}
          className={`${tab} ${tone(activeKey === "saved")}`}
        >
          <BookmarkIcon className="h-5 w-5" />
          Saved
        </button>
      </div>
    </nav>
  );
}
