"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { PASSWORD_HINT, checkPassword } from "@/lib/password";
import { initials } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image";
import { uploadPhoto } from "@/lib/photos";
import { PlateStarIcon, SettingsIcon } from "@/components/icons";
import { ProfileActivity } from "@/components/ProfileActivity";
import { POINT_RULES } from "@/lib/points";

const inputClass =
  "mb-4 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-sm transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";

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
  const [avatarError, setAvatarError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!account) return;
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data: { posts: Post[] }) => {
        setMyPosts(data.posts.filter((p) => p.userId === account.id));
        setSavedPosts(data.posts.filter((p) => p.savedBy.includes(account.id)));
      });
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
      // Up to the blob store first, then the row takes its address — same
      // path a post photo travels, and the same reason.
      const url = await uploadPhoto(await resizeImageToJpeg(file), "avatar");
      const error = await updateAvatar(url);
      if (error) setAvatarError(error);
    } catch {
      setAvatarError("Couldn't read that image, try another.");
    }
    setUploading(false);
  }

  return (
    <div className="mx-4 overflow-hidden rounded-2xl bg-white sm:mx-6">
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

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-pm-grey-tint/60 px-3 py-3">
          <p className="font-mono text-lg font-semibold leading-none tabular-nums text-zinc-900">
            {account.points}
          </p>
          <p className="mono-label text-zinc-500">Plate Points</p>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-pm-grey-tint/60 px-3 py-3 text-center">
            <p className="font-mono text-lg font-medium tabular-nums text-zinc-900">{myPosts.length}</p>
            <p className="mono-label text-zinc-500">Posts</p>
          </div>
          <div className="rounded-xl bg-pm-grey-tint/60 px-3 py-3 text-center">
            <p className="font-mono text-lg font-medium tabular-nums text-zinc-900">{commentCount}</p>
            <p className="mono-label text-zinc-500">Comments</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-xl bg-pm-grey-tint/50 px-4 py-3">
        <PlateStarIcon className="h-5 w-7 shrink-0 text-zinc-500" />
        <p className="text-sm text-zinc-600">
          Earn Plate Points by posting (+{POINT_RULES.createPost}), getting upvoted (+
          {POINT_RULES.receiveUpvote}), getting commented on (+{POINT_RULES.receiveComment}), and
          having your comments upvoted (+{POINT_RULES.receiveCommentUpvote}) on Discover.
        </p>
      </div>

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

      {/* This is the part of the page you come back to check. The two settings
          ledgers and the delete panel used to sit directly under it, which put
          six things you configure once between your activity and your own
          plates; they live on /account/settings now, behind the gear beside
          your name. */}
      <ProfileActivity />

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
