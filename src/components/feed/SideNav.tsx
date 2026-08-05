"use client";

import Link from "next/link";
import {
  HomeIcon,
  CompassIcon,
  BookmarkIcon,
  UserIcon,
  PlusIcon,
} from "@/components/icons";
import { PointsBadge } from "./PointsBadge";
import { initials, avatarPalette } from "@/lib/format";
import { BrandMark, WordMark } from "@/components/BrandMark";

export type NavKey = "home" | "explore" | "leaderboard" | "saved" | "profile";

const item =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";
const idle = "text-zinc-600 hover:bg-white hover:text-zinc-900";
const active = "bg-white font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200/70";

/** Desktop-only rail. The mobile equivalent is MobileNavigation. */
export function SideNav({
  activeKey,
  account,
  onNavigate,
  onCreate,
}: {
  activeKey: NavKey;
  account: { name: string; points: number; avatarUrl?: string } | null;
  onNavigate: (key: Extract<NavKey, "home" | "saved" | "leaderboard">) => void;
  onCreate: () => void;
}) {
  const palette = avatarPalette(account?.name ?? "");

  return (
    <nav aria-label="Main" className="sticky top-6 flex flex-col gap-1">
      <Link href="/" className="group mb-3 flex items-center gap-2.5 px-2 text-lg">
        <BrandMark tone="dark" className="h-10 w-10 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110" />
        <WordMark tone="dark" />
      </Link>

      <button
        type="button"
        onClick={() => onNavigate("home")}
        aria-current={activeKey === "home" ? "page" : undefined}
        className={`${item} ${activeKey === "home" ? active : idle}`}
      >
        <HomeIcon className="h-5 w-5 shrink-0" />
        Home
      </button>

      <Link href="/" className={`${item} ${activeKey === "explore" ? active : idle}`}>
        <CompassIcon className="h-5 w-5 shrink-0" />
        Explore
      </Link>

      <button
        type="button"
        onClick={() => onNavigate("saved")}
        aria-current={activeKey === "saved" ? "page" : undefined}
        className={`${item} ${activeKey === "saved" ? active : idle}`}
      >
        <BookmarkIcon className="h-5 w-5 shrink-0" />
        Saved
      </button>

      <Link href="/account" className={`${item} ${activeKey === "profile" ? active : idle}`}>
        <UserIcon className="h-5 w-5 shrink-0" />
        Profile
      </Link>

      <button
        type="button"
        onClick={onCreate}
        className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-pm-orange px-4 text-sm font-semibold text-white shadow-sm transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <PlusIcon className="h-4 w-4" />
        Create Post
      </button>

      {account && (
        <Link
          href="/account"
          className="mt-4 flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} text-xs font-semibold text-white`}
            >
              {initials(account.name)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-800">
              {account.name}
            </span>
            <PointsBadge points={account.points} className="mt-0.5" />
          </span>
        </Link>
      )}
    </nav>
  );
}
