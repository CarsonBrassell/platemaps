"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image";
import { PlateStarIcon } from "@/components/icons";
import { POINT_RULES } from "@/lib/points";
import { cuisines, restaurants } from "@/data/restaurants";

const inputClass =
  "mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none";

type Post = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  restaurant?: string;
  savedBy: string[];
  comments: { id: string }[];
};

/** Mirrors lib/db.ts's FriendRequestSummary — that file is server-only
    (it imports the Neon client directly), so this page keeps its own
    client-side copy of the shape rather than importing it. */
type FriendRequestSummary = {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
};

function UtensilsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-pm-orange-text"
      aria-hidden="true"
    >
      <path d="M3 2v7a2 2 0 0 0 2 2v11" />
      <path d="M7 2v9" />
      <path d="M5 2v9" />
      <path d="M19 2c-1.7 0-3 2-3 4.5S17.3 11 19 11v11" />
    </svg>
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && (!name || !email || !password)) {
      setError("Fill in every field to create your account.");
      return;
    }
    if (mode === "login" && (!email || !password)) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    const result =
      mode === "signup" ? await signUp(name, email, password) : await signIn(email, password);
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <div className="flex justify-center bg-white px-5 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="PlateMaps" className="h-16 w-auto" />
        </div>
        <div className="mb-6 flex rounded-lg bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200/60">
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={
              mode === "signup"
                ? "flex-1 rounded-md bg-white py-1.5 text-sm font-medium text-pm-orange-text shadow-sm transition-all"
                : "flex-1 rounded-md py-1.5 text-sm text-zinc-500 transition-all hover:text-zinc-700"
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
                ? "flex-1 rounded-md bg-white py-1.5 text-sm font-medium text-pm-orange-text shadow-sm transition-all"
                : "flex-1 rounded-md py-1.5 text-sm text-zinc-500 transition-all hover:text-zinc-700"
            }
          >
            Log in
          </button>
        </div>

        <h1 className="mb-1 text-xl font-medium text-zinc-900">
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

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
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
    <div className="bg-white">
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-pm-charcoal-light to-pm-charcoal">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(232,135,90,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(232,135,90,0.2), transparent 45%)",
          }}
          aria-hidden="true"
        />
      </div>
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pm-orange text-2xl font-medium text-white">
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
            <h1 className="text-xl font-medium text-zinc-900">{account.name}</h1>
            <p className="text-sm text-zinc-500">{account.email}</p>
            {uploading && <p className="mt-1 text-xs text-zinc-500">Uploading...</p>}
            {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="trending-glow flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-pm-orange bg-white px-3 py-3">
          <PlateStarIcon className="h-7 w-9 text-pm-orange" />
          <p className="text-lg font-bold leading-none text-pm-orange-text">{account.points}</p>
          <p className="text-xs font-medium text-pm-orange-text">PM Points</p>
        </div>
        <div className="card-lift col-span-2 grid grid-cols-2 divide-x divide-zinc-200 rounded-xl border border-zinc-200 shadow-sm">
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-medium text-zinc-900">{myPosts.length}</p>
            <p className="text-xs text-zinc-500">Posts</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-lg font-medium text-zinc-900">{commentCount}</p>
            <p className="text-xs text-zinc-500">Comments</p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-pm-orange-border bg-pm-orange-tint px-4 py-3">
        <PlateStarIcon className="h-6 w-8 shrink-0 text-pm-orange" />
        <p className="text-sm text-pm-orange-text">
          Earn PM Points by posting (+{POINT_RULES.createPost}), getting upvoted (+
          {POINT_RULES.receiveUpvote}), and getting commented on (+{POINT_RULES.receiveComment}
          ) on Discover.
        </p>
      </div>

      <FriendRequestsPanel />

      <ProfileSettingsPanel />

      {myPosts.length > 0 && (
        <>
          <p className="mb-2 text-sm font-bold text-pm-orange-text">Your posts</p>
          <div className="mb-6 grid grid-cols-3 gap-1">
            {myPosts.map((post) => (
              <div
                key={post.id}
                className="card-lift flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-gradient-to-br from-pm-orange-tint to-orange-100 p-2 text-center"
              >
                {post.restaurant ? (
                  <>
                    <UtensilsIcon />
                    <span className="line-clamp-2 text-xs font-medium text-pm-orange-text">
                      {post.restaurant}
                    </span>
                  </>
                ) : (
                  <span className="line-clamp-4 text-xs text-pm-orange-text">{post.text}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Saved</p>
      {savedPosts.length > 0 ? (
        <div className="mb-2 grid grid-cols-3 gap-1">
          {savedPosts.map((post) => (
            <div
              key={post.id}
              className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-pm-orange-tint p-2 text-center"
            >
              {post.restaurant ? (
                <>
                  <UtensilsIcon />
                  <span className="line-clamp-2 text-xs font-medium text-pm-orange-text">
                    {post.restaurant}
                  </span>
                </>
              ) : (
                <span className="line-clamp-4 text-xs text-pm-orange-text">{post.text}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-center">
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
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-all hover:bg-zinc-50 active:scale-[0.97]"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

/**
 * Mutual friend requests: incoming needs this user's response, outgoing is
 * waiting on the other side. No count of total friends is shown anywhere on
 * this page or anywhere else — the spec is explicit that follower/friend
 * counts never display.
 */
function FriendRequestsPanel() {
  const [incoming, setIncoming] = useState<FriendRequestSummary[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/friends")
      .then((res) => res.json())
      .then((data: { incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }) => {
        setIncoming(data.incoming ?? []);
        setOutgoing(data.outgoing ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }

  useEffect(load, []);

  async function respond(requestId: string, action: "accept" | "decline") {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) setIncoming((prev) => prev.filter((r) => r.id !== requestId));
    } finally {
      setBusyId(null);
    }
  }

  // Nothing pending and nothing to show — the panel just doesn't render
  // rather than taking up space with an empty state nobody needs to see.
  if (loaded && incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 p-4">
      <p className="mb-3 text-sm font-bold text-pm-orange-text">Friend requests</p>

      {incoming.length === 0 && outgoing.length === 0 ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {incoming.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              {r.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
                  {initials(r.name)}
                </div>
              )}
              <p className="min-w-0 flex-1 truncate text-sm text-zinc-800">{r.name}</p>
              <button
                onClick={() => respond(r.id, "accept")}
                disabled={busyId === r.id}
                className="rounded-full bg-pm-orange px-3 py-1.5 text-xs font-medium text-white transition-transform active:scale-95 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => respond(r.id, "decline")}
                disabled={busyId === r.id}
                className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          ))}

          {outgoing.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              {r.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-300 text-xs font-medium text-white">
                  {initials(r.name)}
                </div>
              )}
              <p className="min-w-0 flex-1 truncate text-sm text-zinc-500">{r.name}</p>
              <span className="text-xs text-zinc-400">Request sent</span>
            </div>
          ))}
        </div>
      )}
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
    <div className="mb-6 rounded-xl border border-zinc-200 p-4">
      <p className="mb-3 text-sm font-bold text-pm-orange-text">Profile settings</p>

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
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
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

export default function AccountPage() {
  const { isSignedIn, loading } = useAuth();

  return (
    <div className="app-shell mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />
      {!loading && (isSignedIn ? <AccountOverview /> : <AuthForm />)}
    </div>
  );
}
