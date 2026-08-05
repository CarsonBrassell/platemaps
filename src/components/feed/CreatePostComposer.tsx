"use client";

import Link from "next/link";
import { CameraIcon, VideoIcon, TagIcon, PinIcon, PriceIcon, StarIcon } from "@/components/icons";
import { initials, avatarPalette } from "@/lib/format";

/** Each shortcut opens the same modal — they signal what a post can carry. */
const SHORTCUTS = [
  { label: "Photo", Icon: CameraIcon },
  { label: "Video", Icon: VideoIcon },
  { label: "Restaurant", Icon: TagIcon },
  { label: "Location", Icon: PinIcon },
  { label: "Price", Icon: PriceIcon },
  { label: "Rating", Icon: StarIcon },
];

export function CreatePostComposer({
  name,
  avatarUrl,
  isSignedIn,
  onOpen,
}: {
  name?: string;
  avatarUrl?: string;
  isSignedIn: boolean;
  onOpen: () => void;
}) {
  if (!isSignedIn) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 shadow-sm">
        <p className="text-sm text-zinc-600">
          <Link href="/account" className="font-medium text-pm-orange-text hover:underline">
            Sign in
          </Link>{" "}
          to post what you&apos;re eating and start earning PM Points.
        </p>
      </div>
    );
  }

  const palette = avatarPalette(name ?? "");

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} text-sm font-semibold text-white`}
          >
            {initials(name ?? "?")}
          </span>
        )}

        <button
          type="button"
          onClick={onOpen}
          className="min-h-11 flex-1 rounded-full bg-pm-grey-tint/70 px-4 text-left text-sm text-zinc-500 transition-colors hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          What did you eat?
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 border-t border-zinc-100 pt-2">
        {SHORTCUTS.map(({ label, Icon }) => (
          <button
            key={label}
            type="button"
            onClick={onOpen}
            className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-pm-grey-tint/60 hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
