"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PointsBadge } from "@/components/feed/PointsBadge";
import { CameraIcon, SettingsIcon } from "@/components/icons";
import { PhoneProfileAuth } from "@/components/mobile/PhoneProfileAuth";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image";
import { uploadAvatar } from "@/lib/photos";
import { PlatePointsPanel } from "@/components/PlatePointsPanel";
import { ProfileShelves, useRollCallArrival } from "@/components/ProfileShelves";

/**
 * Profile, phone version.
 *
 * Every read and write is the web `/account` page's, unchanged: `/api/auth/me`
 * through `useAuth`, `/api/posts` for your own and your saved plates,
 * `/api/account/activity` (inside ProfileShelves), `/api/auth/avatar` and
 * `/api/account/settings`. The order is the web page's too — who you are, then
 * what happened to your plates, then the settings you configure once.
 *
 * What is different is proportion, not content. The three-across stat grid
 * becomes points-as-a-badge, the settings selects grow to 44px, and the post
 * grids stay three-up because a square thumbnail at 390px is still 118px,
 * which is a legible tile. The Posts and Comments tiles were removed from both
 * bodies together — see the twin note in app/account/page.tsx.
 *
 * **No friend or follower count appears here**, and none may be added — see
 * `getFriends` in lib/db.ts. The Friends row below links to the graph without
 * quantifying it, exactly like the web page's does.
 */

/** Mirrors the fields this screen reads off /api/posts. */
type Post = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  restaurant?: string;
  dishName?: string;
  /** Dish percent or restaurant stars — ratingKind says which (lib/db.ts). */
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  /** When it was posted — the profile tiles print the day. */
  createdAt: string;
  savedBy: string[];
  /**
   * Full comments — the sheet reads them, and replies written from it are
   * appended here; the tiles print the length. `parentId` is what makes the
   * sheet's thread nest, so it has to survive this mirror.
   */
  comments: {
    id: string;
    parentId?: string | null;
    userId?: string;
    authorName: string;
    authorAvatarUrl?: string;
    text: string;
    createdAt: string;
  }[];
  /** Mirrors PostMedia in lib/db.ts — that module is server-only. */
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  /** The author's share-photos snapshot, frozen at write time. */
  photosPublic?: boolean;
  /**
   * Hearts on this plate, for the shelf badge's reaction total. Same rule as
   * the twin type in app/account/page.tsx: present only on plates you wrote,
   * because `getProfilePosts` nulls it in SQL for the saved posts riding along
   * in the same response. Hearts are private; a count is still a disclosure.
   */
  heartCount?: number | null;
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Marks the Profile nav dot read, the same way `lib/navAlerts.ts` does when the
 * web `/account` page is opened.
 *
 * That hook keys on `pathname === "/account"` and cannot see this tree, so
 * without this the dot would light up and never clear down here. Key format and
 * per-account scoping are copied from it verbatim — change one, change both.
 * See the twin comment in PhoneFriendsScreen for why this writes `Date.now()`
 * on mount rather than the newest event's timestamp after the fetch.
 */
function useMarkProfileSeen(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const key = `platemaps:nav-seen:${userId}:profile`;
    try {
      const seen = Number(window.localStorage.getItem(key)) || 0;
      window.localStorage.setItem(key, String(Math.max(seen, Date.now())));
    } catch {
      /* ignore */
    }
  }, [userId]);
}

/** A square tone tile standing in for a post with no photo, per DESIGN.md. */
/**
 * One square in a profile grid.
 *
 * **A post with a photo shows the photo.** The grid used to draw a tone block
 * with the restaurant's name on it no matter what, so a plate you posted with
 * a picture attached arrived here as a beige tile and read as "my photo didn't
 * save". The tone block is what DESIGN.md prescribes for a *missing* photo, not
 * a substitute for one that exists.
 *
 * No name over the photo: legible text on an arbitrary picture needs a scrim,
 * and scrims are gradients, which the shape rules forbid. The tile shows the
 * strongest thing the post has — its photo, or failing that its restaurant,
 * or failing that its words.
 *
 * `viewerId` decides whether a photo may be drawn at all. Your own plate always
 * shows you its photo; someone else's (the Saved grid holds other people's
 * posts) only does if it was posted public, matching what Discover would have
 * shown you. Videos fall through to the tone block — nothing in the product
 * produces one yet (`resizePhotos` takes images only), and a muted `<video>`
 * autoplaying in a 3-up grid is not a thing to add by accident.
 */
function PostTile({
  post,
  tone,
  viewerId,
}: {
  post: Post;
  tone: number;
  viewerId: string | null;
}) {
  const mine = post.userId === viewerId;
  const photo =
    mine || post.photosPublic ? post.media?.find((m) => m.type === "image") : undefined;

  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.url}
        alt={photo.alt ?? ""}
        className="aspect-square w-full rounded-[10px] object-cover"
      />
    );
  }

  return (
    <div
      className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[10px] p-2 text-center"
      style={{ background: `var(--pm-tone-${tone})` }}
    >
      {post.restaurant ? (
        <span className="line-clamp-3 text-[11px] font-medium leading-snug text-zinc-700">
          {post.restaurant}
        </span>
      ) : (
        <span className="line-clamp-4 text-[11px] leading-snug text-zinc-600">{post.text}</span>
      )}
    </div>
  );
}

function ProfileOverview() {
  const { account, signOut, updateAvatar } = useAuth();
  const nav = useSearchParams().get("nav");
  const to = (href: string) => (nav ? `${href}?nav=${nav}` : href);

  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useMarkProfileSeen(account?.id);

  /* The roll-call — same hook, same beats, same storage keys as the web
     page, so opening the profile in either body consumes the same "since
     you last looked" window. The panel below prints its displayPoints. */
  const arrival = useRollCallArrival(account, myPosts, postsReady);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    /* ?mine=1 — see the note at the same fetch in app/account/page.tsx. */
    fetch("/api/posts?mine=1")
      .then((res) => res.json())
      .then((data: { posts: Post[] }) => {
        if (cancelled) return;
        setMyPosts(data.posts.filter((p) => p.userId === account.id));
        setSavedPosts(data.posts.filter((p) => p.savedBy.includes(account.id)));
        setPostsReady(true);
      })
      .catch(() => {
        /* The grids fall back to their empty states, which are valid. */
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!account) return null;


  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Choose an image file.");
      return;
    }
    setAvatarError("");
    setUploading(true);
    try {
      // Up to the blob store first, then the row takes its address — same
      // path a post photo travels, and the same reason.
      const url = await uploadAvatar(await resizeImageToJpeg(file));
      const error = await updateAvatar(url);
      if (error) setAvatarError(error);
    } catch {
      setAvatarError("Couldn't read that image, try another.");
    }
    setUploading(false);
  }

  return (
    <div className="min-h-dvh">
      {/* No card ground of its own. The profile sits directly on the app's
          cream page background, the same way /m/friends does, so that every
          white thing on it — the plate frames above all — reads as a card
          instead of dissolving into a white sheet. */}
      <div className="mx-4">
        {/* A flat band of warm tone where a cover photo would go — deliberate,
            not a gradient. */}
        <div className="m-2.5 h-20 rounded-xl bg-[var(--pm-tone-1)]" aria-hidden="true" />

        <div className="px-4 pb-6">
          <div className="mb-5 flex items-end gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={`group relative -mt-9 h-[72px] w-[72px] shrink-0 rounded-full ring-4 ring-white transition-transform active:scale-95 disabled:opacity-60 ${FOCUS}`}
              aria-label="Change profile photo"
            >
              {account.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-[72px] w-[72px] rounded-full object-cover"
                />
              ) : (
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-pm-grey-tint font-mono text-2xl font-medium text-pm-grey-text">
                  {initials(account.name)}
                </div>
              )}
              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-pm-orange text-[#F7F4EC]">
                <CameraIcon className="h-3.5 w-3.5" />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="font-display truncate text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
                {account.name}
              </h1>
              {/* An address is a machine value, so mono (DESIGN.md). */}
              <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                {account.email}
              </p>
              <PointsBadge points={account.points} size="md" className="mt-1.5" />
            </div>

            {/* The doorway to /m/account/settings, beside the name it belongs
                to. Icon only, unlike the web page's labelled pill, and that is
                the width arguing rather than a different opinion about clarity:
                the card is 326px inside its padding, the avatar and its gap
                take 88, and a gear + "Settings" would leave the name ~118px and
                truncate it on most accounts. A 44px disc leaves it 178. */}
            <Link
              href={to("/m/account/settings")}
              aria-label="Settings"
              className={`mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text transition-transform active:scale-95 ${FOCUS}`}
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </div>

          {uploading && (
            <p role="status" className="mb-3 text-xs text-zinc-500">
              Uploading...
            </p>
          )}
          {avatarError && (
            <p role="alert" className="mb-3 text-xs text-red-700">
              {avatarError}
            </p>
          )}

          {/* Replaces a grey card that spelled the same rules out in prose.
              The total was a muted chip up beside the name and the rules were
              down here in zinc — so the number the screen is actually about
              was the quietest thing on it. Both now live in one orange panel;
              the full rules, milestones included, are behind its info button. */}
          <PlatePointsPanel points={arrival.displayPoints} showRank className="mb-5" />

          {/* The approved order from the prototype: the total, then the
              plates that earned it — badged and ring-pulsed by the roll-call
              — before any secondary counts or lists. */}
          {/* The detail sheet's replies come back here to be appended — the
              twin of the wiring in app/account/page.tsx, and for the same
              reason: this screen owns the array the thread and the tile counts
              both read. */}
          <ProfileShelves
            posts={myPosts}
            arrival={arrival}
            onCommentAdded={(postId, comment) =>
              setMyPosts((prev) =>
                prev.map((p) =>
                  p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
                )
              )
            }
          />

          {/* Friend requests are answered on /m/friends, where the people they
              are about already live — this screen is about you. No total here,
              deliberately: friend counts never display in this product. */}
          <p className="mb-5 text-[13px] text-zinc-500">
            <Link
              href={to("/m/friends")}
              className={`rounded-sm font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 ${FOCUS}`}
            >
              Friends
            </Link>{" "}
            — see who you know and answer any requests waiting on you.
          </p>

          {/* The "Activity on your plates" list stood here — removed for the
              reason given at the same spot in app/account/page.tsx: the
              shelves above say which plates drew reactions, and a screen
              this size cannot afford to say it twice. */}

          <p className="mono-label mb-2.5 mt-8 text-zinc-900">Saved</p>
          {savedPosts.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {savedPosts.map((post, i) => (
                <PostTile
                  key={post.id}
                  post={post}
                  tone={((i + 1) % 3) + 1}
                  viewerId={account.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-pm-grey-tint/50 p-6 text-center">
              <p className="mb-1 text-sm font-medium text-zinc-800">Nothing saved yet</p>
              <p className="text-sm text-zinc-500">Bookmark a post from the feed to see it here.</p>
            </div>
          )}

          <p className="mt-6 text-xs leading-relaxed text-zinc-500">
            <Link
              href={to(`/m/u/${account.id}`)}
              className={`rounded-sm underline decoration-zinc-300 underline-offset-2 ${FOCUS}`}
            >
              See your public profile
            </Link>{" "}
            — what other people see when they look you up.
          </p>

          <button
            type="button"
            onClick={signOut}
            className={`mt-4 min-h-11 w-full rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-transform active:scale-[0.98] ${FOCUS}`}
          >
            Log out
          </button>

          {/* Directly under the button, not after the screen — see LegalLinks. */}
          <LegalLinks className="mt-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Terms and Privacy, the pair Apple checks a shipped app links from inside
 * itself. Rendered by both branches of the screen — these are the documents a
 * visitor agreed to, and they have to be reachable after signup, not only at
 * the moment of consent.
 *
 * It renders *inside* each branch rather than as a sibling after them, which
 * is the whole point of it being a component. As a sibling it sat below a
 * `min-h-dvh` wrapper, so on any screen whose content was shorter than the
 * viewport the wrapper stretched to full height and shoved these links to the
 * very bottom — a hundred points of cream away from the Log out button they
 * belong under. Inside, they sit directly under it at any content length.
 *
 * Muted small text on the cream ground, so --pm-grey-text and not zinc-400 —
 * the web's zinc-400 clears 4.5:1 on a white card and does not on this ground.
 * min-h-11 because a thumb has to hit them.
 */
function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={`flex items-center justify-center gap-3 pb-4 text-xs text-pm-grey-text ${className}`}
    >
      <Link
        href="/terms"
        className="inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        Terms of Service
      </Link>
      <span aria-hidden="true">&middot;</span>
      <Link
        href="/privacy"
        className="inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        Privacy Policy
      </Link>
    </nav>
  );
}

export function PhoneProfileScreen() {
  const { isSignedIn, loading } = useAuth();

  /* Nothing renders while the session is resolving: an auth form that flashes
     and is replaced by a profile is worse than a beat of cream. */
  if (loading) return <div className="min-h-dvh" />;

  return (
    <>
      {isSignedIn ? (
        <ProfileOverview />
      ) : (
        <>
          <PhoneProfileAuth />
          <LegalLinks className="mt-2" />
        </>
      )}

    </>
  );
}
