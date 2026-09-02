"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { PASSWORD_HINT, checkPassword } from "@/lib/password";
import { initials } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image";
import { uploadAvatar } from "@/lib/photos";
import { SettingsIcon } from "@/components/icons";
import { PlatePointsPanel } from "@/components/PlatePointsPanel";
import { ProfileShelves, useRollCallArrival } from "@/components/ProfileShelves";

const inputClass =
  "mb-4 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-sm transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";

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
   * Full comments — the sheet reads them, and replies from it are appended
   * here; the tiles print the length. `parentId` is what makes the sheet's
   * thread nest, so it has to survive this mirror.
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
   * Hearts on this plate, for the shelf badge's reaction total. Present only
   * on plates you wrote: hearts are private, and `getProfilePosts` nulls the
   * count in SQL for the saved posts this same response carries. The Saved
   * grid below therefore never has one to render, which is the intent — don't
   * put a heart count on a tile.
   */
  heartCount?: number | null;
};

/**
 * One square in a profile grid — the twin of PhoneProfileScreen's PostTile,
 * and the same rule: **a post with a photo shows the photo.** Both grids used
 * to draw a tone block with the restaurant's name on it regardless, so a plate
 * posted with a picture arrived here beige and read as "my photo didn't save".
 * The tone block is DESIGN.md's answer to a *missing* photo, not a stand-in for
 * one that exists.
 *
 * No name over the photo: legible text on an arbitrary picture wants a scrim,
 * and scrims are gradients, which the shape rules forbid.
 *
 * `viewerId` gates it. Your own plate always shows you its photo; someone
 * else's — the Saved grid is full of other people's posts — only if it was
 * posted public, which is what Discover would have shown you. Videos fall
 * through to the tone block; nothing here produces one yet.
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
      className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] p-2 text-center"
      style={{ background: `var(--pm-tone-${tone})` }}
    >
      {post.restaurant ? (
        <span className="line-clamp-2 text-xs font-medium text-zinc-700">{post.restaurant}</span>
      ) : (
        <span className="line-clamp-4 text-xs text-zinc-600">{post.text}</span>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function AuthForm() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  /* Shown as a hint rather than an error: it appears while the field is still
     half-typed, when "Use at least 8 characters" is information, not a
     complaint. The submit path reports the same string as an error. */
  const weakPassword = mode === "signup" && password ? checkPassword(password, { name, email }) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && (!name || !email || !password)) {
      setError("Fill in every field to create your account.");
      return;
    }
    if (mode === "signup" && !agreed) {
      setError("You must confirm you are 13 or older and agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (mode === "login" && (!email || !password)) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "signup") {
      const weak = checkPassword(password, { name, email });
      if (weak) {
        setError(weak);
        return;
      }
    }
    setSubmitting(true);
    const result =
      mode === "signup"
        ? await signUp(name, email, password, agreed)
        : await signIn(email, password);
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <div className="flex justify-center px-4 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6">
        {/* No logo on this card. The Header above it already carries the mark
            and the name, so a second lockup 100px below the first was the
            brand introducing itself twice on one screen. The form's own
            heading ("Create your account" / "Welcome back") is what this card
            needs to say. */}
        <div className="mb-6 flex rounded-full bg-pm-grey-tint p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={
              mode === "signup"
                ? "flex-1 rounded-full bg-pm-orange py-1.5 text-sm font-medium text-[#F7F4EC] transition-all"
                : "flex-1 rounded-full py-1.5 text-sm text-pm-grey-text transition-all hover:text-zinc-900"
            }
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={
              mode === "login"
                ? "flex-1 rounded-full bg-pm-orange py-1.5 text-sm font-medium text-[#F7F4EC] transition-all"
                : "flex-1 rounded-full py-1.5 text-sm text-pm-grey-text transition-all hover:text-zinc-900"
            }
          >
            Log in
          </button>
        </div>

        <h1 className="mb-1 font-display text-xl font-semibold text-zinc-900">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          {mode === "signup"
            ? "Save your favorite San Diego spots and earn Plate Points."
            : "Sign in to see your saved spots and Plate Points."}
        </p>

        {mode === "signup" && (
          <>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Username</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="carsonb"
              autoComplete="username"
              maxLength={24}
              className={inputClass}
            />
            <p className="-mt-2 mb-4 text-xs text-zinc-500">
              3-24 characters — letters, numbers and underscores only. This is how people find and
              @mention you, and it has to be unique.
            </p>
          </>
        )}

        <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@email.com"
          className={inputClass}
        />

        <label className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Create a password" : "Your password"}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className={inputClass}
        />

        {/* The rule while you type, and the reason it isn't a list of symbol
            requirements — see lib/password.ts. The server checks again on
            submit; this only saves a round trip. */}
        {mode === "signup" && (
          <p className="-mt-2 mb-4 text-xs text-zinc-500">{weakPassword ?? PASSWORD_HINT}</p>
        )}

        {mode === "login" && (
          <p className="-mt-2 mb-4 text-xs">
            <Link
              href="/forgot-password"
              className="text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
            >
              Forgot your password?
            </Link>
          </p>
        )}

        {mode === "signup" && (
          <label className="mb-4 flex cursor-pointer items-start gap-2.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (error) setError("");
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-pm-orange"
            />
            <span>
              I am 13 or older and I agree to the{" "}
              <Link
                href="/terms"
                target="_blank"
                className="underline underline-offset-2 hover:text-zinc-700"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="underline underline-offset-2 hover:text-zinc-700"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || (mode === "signup" && !agreed)}
          className="w-full rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          {mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}

function AccountOverview() {
  const { account, signOut, updateAvatar } = useAuth();
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [postsReady, setPostsReady] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* The roll-call: what plays when reactions have landed since the last
     visit. Called before the account guard because hooks must be — it
     handles null itself. The panel below prints its displayPoints so the
     total can roll up from where you left it. */
  const arrival = useRollCallArrival(account, myPosts, postsReady);

  useEffect(() => {
    if (!account) return;
    /* ?mine=1 — this screen shows your plates and your saves; without it the
       request returns the whole corpus so the two filters below can discard
       ~99% of it. See getProfilePosts in lib/db.ts. */
    fetch("/api/posts?mine=1")
      .then((res) => res.json())
      .then((data: { posts: Post[] }) => {
        setMyPosts(data.posts.filter((p) => p.userId === account.id));
        setSavedPosts(data.posts.filter((p) => p.savedBy.includes(account.id)));
        setPostsReady(true);
      });
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
    /* No card ground of its own — see the note in PhoneProfileScreen. The
       profile sits on the cream page background so its white cards read. */
    <div className="mx-4 sm:mx-6">
      {/* A flat band of warm tone where a cover photo would go — deliberate,
          not a gradient. */}
      <div className="m-2.5 h-24 rounded-xl bg-[var(--pm-tone-1)]" aria-hidden="true" />
      <div className="px-5 pb-8">
        <div className="mb-6 flex items-end gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group relative -mt-10 h-20 w-20 shrink-0 rounded-full ring-4 ring-white transition-transform active:scale-95 disabled:opacity-60"
            aria-label="Change profile photo"
          >
            {account.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.avatarUrl}
                alt=""
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-2xl font-medium text-pm-grey-text">
                {initials(account.name)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-pm-orange text-white transition-transform group-hover:scale-110">
              <CameraIcon />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <div className="min-w-0 pb-1">
            <h1 className="font-display text-xl font-semibold text-zinc-900">{account.name}</h1>
            <p className="text-sm text-zinc-500">{account.email}</p>
            {uploading && <p className="mt-1 text-xs text-zinc-500">Uploading...</p>}
            {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
          </div>

          {/* The doorway to /account/settings, on the row that names whose
              account this is — which is the row a gear belongs beside. Tan
              pill, the unselected chip treatment, because this goes somewhere
              ordinary; the orange is spent on posting and nothing else.

              Labelled rather than a bare glyph. A lone gear is a guess, and
              "Settings" costs 54px on a row with room for it. `ml-auto` rather
              than a spacer so the row still collapses cleanly when the name is
              long. */}
          <Link
            href="/account/settings"
            className="ml-auto mb-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-pm-grey-tint px-4 text-sm font-medium text-pm-grey-text transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <SettingsIcon className="h-4 w-4 shrink-0" />
            Settings
          </Link>
        </div>

      {/* Points lead, and they are now the only count on the page. The Posts
          and Comments tiles that used to sit under the shelves are gone: both
          numbers were already legible from the shelves themselves — the grid
          *is* your posts — so they restated what was directly above them in a
          quieter voice. The number printed is the roll-call's; on an arrival
          it starts at the last-seen total and rolls up once the badges have
          landed. */}
      <PlatePointsPanel points={arrival.displayPoints} showRank className="mb-3" />

      {/* The shelves sit DIRECTLY under the total they explain — the approved
          order from the prototype: identity, then what you've earned, then
          the plates that earned it, badged where something just happened.
          They used to sit below the activity list, which buried the page's
          centrepiece under six rows of detail about the same events. */}
      {/* The sheet writes comments through /api/posts/[id]/comments and hands
          the row back here, because this is where the plates live: appending
          it puts the reply in the open thread and takes the tile's comment
          count up by one in the same render. Same wiring on the phone screen —
          see the twin call in PhoneProfileScreen. */}
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

      {/* Friend requests used to sit here. They moved to /friends, where the
          people they're about already live — this page is about you. */}
      <p className="mb-6 text-sm text-zinc-500">
        <Link
          href="/friends"
          className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
        >
          Friends
        </Link>{" "}
        — see who you know and answer any requests waiting on you.
      </p>

      {/* The "Activity on your plates" list stood here. It was a reverse
          chronological feed of every reaction — and the shelves above now
          answer the question it was really being read for, "which of my
          plates are people reacting to?", which a list ordered by time
          never answered at a glance. Keeping both meant printing the same
          forty events twice on one screen, once as counts on the plates
          and once as rows. The plates won. /api/account/activity is still
          live and still read, by ProfileShelves for the badges and by
          navAlerts for the nav dot. */}

      <p className="mono-label mb-2.5 mt-8 text-zinc-900">Saved</p>
      {savedPosts.length > 0 ? (
        <div className="mb-2 grid grid-cols-3 gap-1.5">
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
          <p className="mb-1 text-sm font-medium">Nothing saved yet</p>
          <p className="text-sm text-zinc-500">
            Bookmark a post from the Feed to see it here.
          </p>
        </div>
      )}

        <p className="mb-2 mt-6 text-xs text-zinc-400">
          <Link href={`/u/${account.id}`} className="underline hover:text-zinc-600">
            See your public profile
          </Link>{" "}
          — what other people see when they look you up.
        </p>

        <button
          onClick={signOut}
          className="min-h-11 rounded-full bg-pm-grey-tint px-4 py-2 text-sm text-pm-grey-text transition-all hover:text-zinc-900 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { isSignedIn, loading } = useAuth();

  return (
    <>
      {/* Header owns the full viewport width — its desktop nav row needs
          close to 1280px to lay out without squeezing, which a max-w-5xl
          parent (1024px) doesn't give it. Nesting it inside the content
          wrapper below made the nav column overflow into the logo and the
          search/avatar. */}
      <Header />
      {/* Cream ground; the overview and auth form supply their own white cards. */}
      <div className="mx-auto w-full max-w-5xl pb-12">
        {!loading && (isSignedIn ? <AccountOverview /> : <AuthForm />)}

        <div className="mt-10 flex justify-center gap-3 text-xs text-zinc-400">
          <Link href="/terms" className="hover:text-zinc-600 hover:underline">
            Terms of Service
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link href="/privacy" className="hover:text-zinc-600 hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    </>
  );
}
