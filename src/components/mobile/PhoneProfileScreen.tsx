"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PointsBadge } from "@/components/feed/PointsBadge";
import { CameraIcon, PlateStarIcon } from "@/components/icons";
import { PhoneProfileActivity } from "@/components/mobile/PhoneProfileActivity";
import { PhoneProfileAuth } from "@/components/mobile/PhoneProfileAuth";
import { PhoneSecurityPanel } from "@/components/mobile/PhoneSecurityPanel";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { POINT_RULES } from "@/lib/points";
import { cuisines } from "@/data/restaurants";

/**
 * Profile, phone version.
 *
 * Every read and write is the web `/account` page's, unchanged: `/api/auth/me`
 * through `useAuth`, `/api/posts` for your own and your saved plates,
 * `/api/account/activity` (inside PhoneProfileActivity), `/api/auth/avatar` and
 * `/api/account/settings`. The order is the web page's too — who you are, then
 * what happened to your plates, then the settings you configure once.
 *
 * What is different is proportion, not content. The three-across stat grid
 * becomes points-as-a-badge plus two narrow tiles, the settings selects grow to
 * 44px, and the post grids stay three-up because a square thumbnail at 390px is
 * still 118px, which is a legible tile.
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
  savedBy: string[];
  comments: { id: string }[];
  /** Mirrors PostMedia in lib/db.ts — that module is server-only. */
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  /** The author's share-photos snapshot, frozen at write time. */
  photosPublic?: boolean;
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const inputClass =
  "mb-4 min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";

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
  const [avatarError, setAvatarError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useMarkProfileSeen(account?.id);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data: { posts: Post[] }) => {
        if (cancelled) return;
        setMyPosts(data.posts.filter((p) => p.userId === account.id));
        setSavedPosts(data.posts.filter((p) => p.savedBy.includes(account.id)));
      })
      .catch(() => {
        /* The grids fall back to their empty states, which are valid. */
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  if (!account) return null;

  const commentCount = myPosts.reduce((sum, p) => sum + p.comments.length, 0);

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
      const dataUrl = await resizeImageToDataUrl(file);
      const error = await updateAvatar(dataUrl);
      if (error) setAvatarError(error);
    } catch {
      setAvatarError("Couldn't read that image, try another.");
    }
    setUploading(false);
  }

  return (
    <div className="min-h-dvh">
      <div className="mx-4 overflow-hidden rounded-2xl bg-white">
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

          {/* Posts and comments are your own output and print freely. The count
              that must never appear on any surface is a friend/follower total. */}
          <div className="mb-5 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-pm-grey-tint/60 px-3 py-2.5 text-center">
              <p className="font-mono text-lg font-medium leading-none tabular-nums text-zinc-900">
                {myPosts.length}
              </p>
              <p className="mono-label mt-1.5 text-zinc-500">Posts</p>
            </div>
            <div className="rounded-xl bg-pm-grey-tint/60 px-3 py-2.5 text-center">
              <p className="font-mono text-lg font-medium leading-none tabular-nums text-zinc-900">
                {commentCount}
              </p>
              <p className="mono-label mt-1.5 text-zinc-500">Comments</p>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-3 rounded-xl bg-pm-grey-tint/50 px-3.5 py-3">
            <PlateStarIcon className="mt-0.5 h-5 w-7 shrink-0 text-zinc-500" />
            <p className="text-[13px] leading-snug text-zinc-600">
              Earn PM Points by posting (+{POINT_RULES.createPost}), getting upvoted (+
              {POINT_RULES.receiveUpvote}), getting commented on (+{POINT_RULES.receiveComment}),
              and having your comments upvoted (+{POINT_RULES.receiveCommentUpvote}) on Discover.
            </p>
          </div>

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

          {/* Above the settings panel on purpose: this is the part of the screen
              you come back to check, and configuration is the part you set once. */}
          <PhoneProfileActivity />

          <ProfileSettingsPanel />

          {/* Same order as the web account page: what the app shows about you,
              then what you do to the account. */}
          <PhoneSecurityPanel />

          {myPosts.length > 0 && (
            <>
              <p className="mono-label mb-2 text-zinc-500">Your posts</p>
              <div className="mb-6 grid grid-cols-3 gap-1.5">
                {myPosts.map((post, i) => (
                  <PostTile key={post.id} post={post} tone={(i % 3) + 1} viewerId={account.id} />
                ))}
              </div>
            </>
          )}

          <p className="mono-label mb-2 text-zinc-500">Saved</p>
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

          <div className="mt-3">
            <PhoneDeleteAccountPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Same real, immediate deletion as the web account page's DeleteAccountPanel
 * — see lib/db.ts's deleteUser comment for exactly what goes with the
 * account (everything, cascaded) — and the same two guards: collapsed
 * behind a tap, and finished only by retyping the password, since a phone
 * left unlocked shouldn't by itself be enough to destroy an account.
 */
function PhoneDeleteAccountPanel() {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    setError("");
    const result = await deleteAccount(password);
    setSubmitting(false);
    // On success `deleteAccount` already cleared the account from context,
    // which flips this screen to its signed-out branch — nothing left to do.
    if (result) setError(result);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-h-11 w-full rounded-full px-4 text-sm font-medium text-red-700 transition-colors active:scale-[0.98] ${FOCUS}`}
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-red-50 p-4">
      <p className="mb-1 text-sm font-semibold text-red-900">Delete your account?</p>
      <p className="mb-3 text-xs leading-relaxed text-red-800">
        This permanently deletes your account, posts, comments, and everything else attached to
        it. There is no undo.
      </p>
      <label htmlFor="phone-delete-password" className="mb-1 block text-xs font-medium text-red-900">
        Enter your password to confirm
      </label>
      <input
        id="phone-delete-password"
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (error) setError("");
        }}
        autoComplete="current-password"
        className={`mb-3 min-h-11 w-full rounded-lg bg-white px-3 text-[16px] outline-2 outline-offset-2 outline-transparent focus:outline-pm-orange ${FOCUS}`}
      />
      {error && <p className="mb-3 text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={submitting || !password}
          className={`min-h-11 flex-1 rounded-full bg-red-700 text-xs font-semibold text-white transition-colors active:scale-[0.97] disabled:opacity-50 ${FOCUS}`}
        >
          {submitting ? "Deleting…" : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError("");
          }}
          className={`min-h-11 flex-1 rounded-full bg-white text-xs font-medium text-red-800 ${FOCUS}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The one global privacy decision in the whole app: whether photos default
 * public. Off by default, per the spec — posting itself asks nothing about
 * privacy; this is the only place that toggle lives. Also holds the two profile
 * favorites, stored as structured references (a real cuisine off the same list
 * Discover's filters use, a real restaurant id) rather than free text, since
 * the point of storing them this way is to use them for taste matching later.
 *
 * `cuisines` is imported rather than derived from the restaurant list because
 * `/api/account/settings` validates the submitted value against exactly that
 * array — offering anything else would build a select whose options the server
 * rejects. Same import the web panel makes.
 */
/**
 * One switch row, phone dressing: a rank-3 local switch, so it wears the
 * segmented tan track with a white selected segment rather than the web
 * panel's iOS-style toggle. Two named options also say what the states are,
 * which a bare track leaves you to infer.
 *
 * Four of these on the panel now — hand-rolling the track each time is how the
 * third one ends up a different width and nobody notices for a month.
 */
function PhoneSettingSwitch({
  label,
  description,
  on,
  disabled,
  onPick,
}: {
  label: string;
  description: string;
  on: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-zinc-800">{label}</p>
      <p className="mt-0.5 text-xs leading-snug text-zinc-500">{description}</p>

      <div
        role="group"
        aria-label={label}
        className="mt-2.5 flex gap-1 rounded-full bg-pm-grey-tint p-1"
      >
        {[
          { value: false, label: "Off" },
          { value: true, label: "On" },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={on === option.value}
            onClick={() => {
              if (on !== option.value) onPick();
            }}
            disabled={disabled}
            className={`mono-label min-h-11 flex-1 rounded-full transition-colors disabled:opacity-50 ${FOCUS} ${
              on === option.value ? "bg-white text-zinc-900" : "text-pm-grey-text"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileSettingsPanel() {
  const { account, updateSettings } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Only the favourite-restaurant <select> needs these, and only to name the
  // options — the id the server validates against is its own row now.
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);

  // Above the `!account` guard, because hooks cannot run conditionally.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/restaurants");
        if (!res.ok) return;
        const data: { restaurants: { id: string; name: string }[] } = await res.json();
        if (!cancelled) setRestaurants(data.restaurants);
      } catch {
        // The select falls back to "Not set" only, which is still a valid
        // state — better than blocking the rest of the settings panel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return null;

  async function handleToggle() {
    setSaving(true);
    setError("");
    const result = await updateSettings({ sharePhotosPublicly: !account!.sharePhotosPublicly });
    if (result) setError(result);
    setSaving(false);
  }

  /** The three privacy switches. Same round trip as every other field here. */
  async function handlePrivacy(
    key: "hideFromLeaderboard" | "discoverableByUsername" | "friendRequestsOpen",
    value: boolean
  ) {
    setSaving(true);
    setError("");
    const result = await updateSettings({ [key]: value });
    if (result) setError(result);
    setSaving(false);
  }

  async function handleCuisine(value: string) {
    setSaving(true);
    setError("");
    const result = await updateSettings({ favoriteCuisine: value || null });
    if (result) setError(result);
    setSaving(false);
  }

  async function handleRestaurant(value: string) {
    setSaving(true);
    setError("");
    const result = await updateSettings({ favoriteRestaurantId: value || null });
    if (result) setError(result);
    setSaving(false);
  }

  return (
    <div className="mb-6 rounded-xl bg-pm-grey-tint/40 p-3.5">
      <p className="mono-label mb-3 text-zinc-500">Profile settings</p>

      <PhoneSettingSwitch
        label="Share my photos publicly"
        /* Framed as forward-only on purpose — this is the one fact about the
           toggle that isn't visually obvious from the switch itself, and
           getting it wrong reads as a broken promise, not a UI bug. */
        description="Off by default. New posts only — turning this on won't make photos you've already shared public."
        on={account.sharePhotosPublicly}
        disabled={saving}
        onPick={handleToggle}
      />

      <PhoneSettingSwitch
        label="Hide me from the leaderboard"
        description="You keep earning points and can still see your own. Friends just won't see you ranked."
        on={account.hideFromLeaderboard}
        disabled={saving}
        onPick={() => void handlePrivacy("hideFromLeaderboard", !account.hideFromLeaderboard)}
      />

      <PhoneSettingSwitch
        label="Let people find me by username"
        description="On by default. Turning it off keeps you out of username search — people you're already friends with still see you."
        on={account.discoverableByUsername}
        disabled={saving}
        onPick={() =>
          void handlePrivacy("discoverableByUsername", !account.discoverableByUsername)
        }
      />

      <PhoneSettingSwitch
        label="Accept friend requests"
        description="Turning this off stops new requests. It doesn't remove the friends you already have."
        on={account.friendRequestsOpen}
        disabled={saving}
        onPick={() => void handlePrivacy("friendRequestsOpen", !account.friendRequestsOpen)}
      />

      <label
        htmlFor="phone-favorite-cuisine"
        className="mb-1 block text-sm font-medium text-zinc-700"
      >
        Favorite cuisine
      </label>
      <select
        id="phone-favorite-cuisine"
        value={account.favoriteCuisine ?? ""}
        onChange={(e) => handleCuisine(e.target.value)}
        disabled={saving}
        className={inputClass}
      >
        <option value="">Not set</option>
        {cuisines.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label
        htmlFor="phone-favorite-restaurant"
        className="mb-1 block text-sm font-medium text-zinc-700"
      >
        Favorite restaurant
      </label>
      <select
        id="phone-favorite-restaurant"
        value={account.favoriteRestaurantId ?? ""}
        onChange={(e) => handleRestaurant(e.target.value)}
        disabled={saving}
        className={inputClass}
      >
        <option value="">Not set</option>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function PhoneProfileScreen() {
  const { isSignedIn, loading } = useAuth();

  /* Nothing renders while the session is resolving: an auth form that flashes
     and is replaced by a profile is worse than a beat of cream. */
  if (loading) return <div className="min-h-dvh" />;

  return (
    <>
      {isSignedIn ? <ProfileOverview /> : <PhoneProfileAuth />}

      {/* The legal footer the web /account page carries, on both the signed-in
          and signed-out views for the same reason it is on both there: these
          are the documents a visitor agreed to, and they have to be reachable
          after signup, not only at the moment of consent. Apple checks that a
          shipped app links them from inside itself.

          Muted small text on the cream ground, so --pm-grey-text and not
          zinc-400 — the web's zinc-400 clears 4.5:1 on a white card and does
          not on this ground. min-h-11 because these are the only two links on
          the screen and a thumb has to hit them. */}
      <nav
        aria-label="Legal"
        className="mt-8 flex items-center justify-center gap-3 pb-4 text-xs text-pm-grey-text"
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
    </>
  );
}
