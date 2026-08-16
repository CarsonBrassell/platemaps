"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { PlateStarIcon } from "@/components/icons";
import { ProfileActivity } from "@/components/ProfileActivity";
import { DeleteAccountPanel } from "@/components/account/DeleteAccountPanel";
import { POINT_RULES } from "@/lib/points";
import { cuisines } from "@/data/restaurants";

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
};

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && (!name || !email || !password)) {
      setError("Fill in every field to create your account.");
      return;
    }
    if (mode === "signup" && !agreed) {
      setError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (mode === "login" && (!email || !password)) {
      setError("Enter your email and password.");
      return;
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
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PlateMaps" className="h-16 w-auto" />
        </div>
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
            ? "Save your favorite San Diego spots and earn PM Points."
            : "Sign in to see your saved spots and PM Points."}
        </p>

        {mode === "signup" && (
          <>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Carson Brassell"
              className={inputClass}
            />
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
          className={inputClass}
        />

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
              I agree to the{" "}
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
      const dataUrl = await resizeImageToDataUrl(file);
      const error = await updateAvatar(dataUrl);
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
          <div className="pb-1">
            <h1 className="font-display text-xl font-semibold text-zinc-900">{account.name}</h1>
            <p className="text-sm text-zinc-500">{account.email}</p>
            {uploading && <p className="mt-1 text-xs text-zinc-500">Uploading...</p>}
            {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-pm-grey-tint/60 px-3 py-3">
          <p className="font-mono text-lg font-semibold leading-none tabular-nums text-zinc-900">
            {account.points}
          </p>
          <p className="mono-label text-zinc-500">PM Points</p>
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
          Earn PM Points by posting (+{POINT_RULES.createPost}), getting upvoted (+
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

      {/* Sits above the settings panel on purpose: this is the part of the
          page you come back to check, and configuration is the part you set
          once. */}
      <ProfileActivity />

      <ProfileSettingsPanel />

      <BlockedUsersPanel />

      {myPosts.length > 0 && (
        <>
          <p className="mono-label mb-2 text-zinc-500">Your posts</p>
          <div className="mb-6 grid grid-cols-3 gap-1.5">
            {myPosts.map((post, i) => (
              <div
                key={post.id}
                className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] p-2 text-center"
                style={{ background: `var(--pm-tone-${(i % 3) + 1})` }}
              >
                {post.restaurant ? (
                  <span className="line-clamp-2 text-xs font-medium text-zinc-700">
                    {post.restaurant}
                  </span>
                ) : (
                  <span className="line-clamp-4 text-xs text-zinc-600">{post.text}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mono-label mb-2 text-zinc-500">Saved</p>
      {savedPosts.length > 0 ? (
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          {savedPosts.map((post, i) => (
            <div
              key={post.id}
              className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-[10px] p-2 text-center"
              style={{ background: `var(--pm-tone-${((i + 1) % 3) + 1})` }}
            >
              {post.restaurant ? (
                <span className="line-clamp-2 text-xs font-medium text-zinc-700">
                  {post.restaurant}
                </span>
              ) : (
                <span className="line-clamp-4 text-xs text-zinc-600">{post.text}</span>
              )}
            </div>
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

        {/* Dead last, below logging out, because logging out is what most
            people reaching this end of the page actually want. */}
        <div className="mt-8">
          <DeleteAccountPanel />
        </div>
      </div>
    </div>
  );
}
/**
 * The one global privacy decision in the whole app: whether photos default
 * public. Off by default, per the spec — posting itself asks nothing about
 * privacy; this is the only place that toggle lives. Also holds the two
 * profile favorites, stored as structured references (a real cuisine off the
 * same list Discover's filters use, a real restaurant id) rather than free
 * text, since the point of storing them this way is to use them for taste
 * matching later.
 */
function ProfileSettingsPanel() {
  const { account, updateSettings } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Only the favourite-restaurant <select> needs these, and only to name the
  // options — the id the server validates against is its own row now.
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);

  // Above the `!account` guard, because hooks cannot run conditionally. The
  // request is cheap and the panel is only mounted on the account screen.
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
    <div className="mb-6 rounded-xl bg-pm-grey-tint/40 p-4">
      <p className="mono-label mb-3 text-zinc-500">Profile settings</p>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-800">Share my photos publicly</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {/* Framed as forward-only on purpose — this is the one fact about
                the toggle that isn't visually obvious from the switch itself,
                and getting it wrong reads as a broken promise, not a UI bug. */}
            Off by default. New posts only — turning this on won&apos;t make photos you&apos;ve
            already shared public.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={account.sharePhotosPublicly}
          onClick={handleToggle}
          disabled={saving}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            account.sharePhotosPublicly ? "bg-pm-orange" : "bg-zinc-300"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
              account.sharePhotosPublicly ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <label className="mb-1 block text-sm font-medium text-zinc-700">Favorite cuisine</label>
      <select
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

      <label className="mb-1 block text-sm font-medium text-zinc-700">Favorite restaurant</label>
      <select
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

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

/**
 * The one place a block is reversible. Post cards and profile pages can
 * create a block, but this is the only surface that lists them and lets you
 * undo one — mirrors ProfileSettingsPanel's shell (mono-label + tinted card)
 * rather than the friends list's white-card style, since this reads as a
 * setting, not a social list.
 */
function BlockedUsersPanel() {
  const { account } = useAuth();
  const [blocked, setBlocked] = useState<{ id: string; name: string; avatarUrl?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    fetch("/api/blocks")
      .then((res) => res.json())
      .then((data: { blocked: { id: string; name: string; avatarUrl?: string }[] }) => {
        setBlocked(data.blocked);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [account]);

  async function handleUnblock(userId: string) {
    setPendingId(userId);
    const previous = blocked;
    setBlocked((b) => b.filter((u) => u.id !== userId));
    try {
      const res = await fetch("/api/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setBlocked(previous);
    }
    setPendingId(null);
  }

  // Nothing blocked and we know it — no reason to show an empty settings
  // card most people will never need.
  if (!account || (loaded && blocked.length === 0)) return null;

  return (
    <div className="mb-6 rounded-xl bg-pm-grey-tint/40 p-4">
      <p className="mono-label mb-3 text-zinc-500">Blocked</p>
      <ul className="space-y-2">
        {blocked.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text">
                  {initials(u.name)}
                </span>
              )}
              <span className="truncate text-sm font-medium text-zinc-800">{u.name}</span>
            </div>
            <button
              type="button"
              onClick={() => handleUnblock(u.id)}
              disabled={pendingId === u.id}
              className="min-h-9 shrink-0 rounded-full bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
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
