"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CameraIcon, ChatIcon } from "@/components/icons";
import { initials, avatarPalette } from "@/lib/format";
import { stashPhotos } from "@/lib/photoHandoff";

/**
 * The doorway into /post. Two ways in — start with a photo, or start with
 * nothing to say but words — and both land on the same question about what kind
 * of post this is.
 *
 * The photo button runs the file dialog here rather than on /post, because a
 * browser only opens one inside the click that asked for it. The chosen files
 * ride over in memory.
 */
export function CreatePostComposer({
  name,
  avatarUrl,
  isSignedIn,
}: {
  name?: string;
  avatarUrl?: string;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

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

  function handleFiles(list: FileList | null) {
    const images = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length) stashPhotos(images);
    router.push("/post");
  }

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

        <Link
          href="/post"
          className="flex min-h-11 flex-1 items-center rounded-full bg-pm-grey-tint/70 px-4 text-sm text-zinc-500 transition-colors hover:bg-pm-grey-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          What did you eat?
        </Link>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Add a photo"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-pm-grey-tint/60 hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <CameraIcon className="h-5 w-5" />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
          aria-label="Choose photos"
        />
      </div>

      <Link
        href="/post"
        className="mt-2.5 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3.5 text-sm text-zinc-500 transition-colors hover:border-pm-orange hover:bg-pm-orange-tint/30 hover:text-pm-orange-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        <ChatIcon className="h-4 w-4 shrink-0" />
        Just leave a comment
      </Link>
    </div>
  );
}
