"use client";

import Link from "next/link";
import { CameraIcon } from "@/components/icons";
import { initials, avatarPalette } from "@/lib/format";

/**
 * One line, one job: open the composer. The row of six field shortcuts that
 * used to sit under this was duplicating what the modal already shows.
 */
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
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm">
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

      <button
        type="button"
        onClick={onOpen}
        aria-label="Add a photo"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-pm-grey-tint/60 hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <CameraIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
