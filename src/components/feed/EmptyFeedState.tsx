"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UtensilsIcon, WifiOffIcon, CompassIcon, PlusIcon } from "@/components/icons";

function Shell({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pm-orange-tint text-pm-orange-text">
        {icon}
      </span>
      <p className="font-display text-base font-semibold text-zinc-900">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const primaryButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-pm-orange px-5 text-sm font-medium text-white transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export function EmptyFeedState({
  tab,
  region,
  onCreate,
  isSignedIn,
}: {
  tab: string;
  region: string;
  onCreate: () => void;
  isSignedIn: boolean;
}) {
  if (tab === "following") {
    return (
      <Shell
        icon={<CompassIcon className="h-6 w-6" />}
        title="Your following feed is quiet"
        body={
          isSignedIn
            ? "Follow a few people whose taste you trust and their plates will land here."
            : "Sign in to follow people and build a feed of the eaters you actually trust."
        }
        action={
          !isSignedIn && (
            <Link href="/account" className={primaryButton}>
              Sign in
            </Link>
          )
        }
      />
    );
  }

  return (
    <Shell
      icon={<UtensilsIcon className="h-6 w-6" />}
      title={`Nothing in ${region} yet`}
      body="No one has posted a plate around here today. Be the first and pick up the points."
      action={
        <button type="button" onClick={onCreate} className={primaryButton}>
          <PlusIcon className="h-4 w-4" />
          Post a plate
        </button>
      }
    />
  );
}

export function FeedErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Shell
      icon={<WifiOffIcon className="h-6 w-6" />}
      title="Couldn't load the feed"
      body="Something went wrong reaching PlateMap. Your connection may have dropped."
      action={
        <button type="button" onClick={onRetry} className={primaryButton}>
          Try again
        </button>
      }
    />
  );
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-xl bg-pm-charcoal px-4 py-2.5 text-sm text-white"
    >
      <WifiOffIcon className="h-4 w-4 shrink-0" />
      You&apos;re offline — showing the last plates we loaded.
    </div>
  );
}

export function EndOfFeed() {
  return (
    <p className="py-8 text-center text-sm text-zinc-400">
      That&apos;s every plate around here. Check back after lunch.
    </p>
  );
}
