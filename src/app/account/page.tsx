"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

const inputClass =
  "mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none";

type Post = {
  id: string;
  userId: string;
  text: string;
  restaurant?: string;
  comments: { id: string }[];
};

function StarIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0 text-pm-orange"
      aria-hidden="true"
    >
      <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5" />
    </svg>
  );
}

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
        <div className="mb-6 flex rounded-lg border border-zinc-200 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
            }}
            className={
              mode === "signup"
                ? "flex-1 rounded-md bg-pm-orange-tint py-1.5 text-sm font-medium text-pm-orange-text transition-all"
                : "flex-1 rounded-md py-1.5 text-sm text-zinc-500 transition-all"
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
                ? "flex-1 rounded-md bg-pm-orange-tint py-1.5 text-sm font-medium text-pm-orange-text transition-all"
                : "flex-1 rounded-md py-1.5 text-sm text-zinc-500 transition-all"
            }
          >
            Log in
          </button>
        </div>

        <h1 className="mb-1 text-lg font-medium text-zinc-900">
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
  const { account, signOut } = useAuth();
  const [myPosts, setMyPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (!account) return;
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data: { posts: Post[] }) =>
        setMyPosts(data.posts.filter((p) => p.userId === account.id))
      );
  }, [account]);

  if (!account) return null;

  const commentCount = myPosts.reduce((sum, p) => sum + p.comments.length, 0);

  return (
    <div className="bg-white px-5 py-8">
      <div className="mb-6 flex items-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xl font-medium text-white">
          {initials(account.name)}
        </div>
        <div>
          <h1 className="text-lg font-medium text-zinc-900">{account.name}</h1>
          <p className="text-sm text-zinc-500">{account.email}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 divide-x divide-zinc-200 rounded-xl border border-zinc-200">
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-medium text-zinc-900">{myPosts.length}</p>
          <p className="text-xs text-zinc-500">Posts</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-medium text-zinc-900">{commentCount}</p>
          <p className="text-xs text-zinc-500">Comments</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-lg font-medium text-pm-orange-text">{account.points}</p>
          <p className="text-xs text-zinc-500">PM Points</p>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-xl border border-pm-orange-border bg-pm-orange-tint px-4 py-3">
        <StarIcon />
        <p className="text-sm text-pm-orange-text">
          Earn PM Points by posting (+10), liking (+2), and commenting (+5) on the Feed.
        </p>
      </div>

      {myPosts.length > 0 && (
        <>
          <p className="mb-2 text-sm font-bold text-pm-orange-text">Your posts</p>
          <div className="mb-6 grid grid-cols-3 gap-1">
            {myPosts.map((post) => (
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
        </>
      )}

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Saved</p>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center">
        <p className="mb-1 text-sm font-medium">Nothing saved yet</p>
        <p className="text-sm text-zinc-500">
          Save a spot from the discover feed to see it here.
        </p>
      </div>

      <button
        onClick={signOut}
        className="mt-6 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-all hover:bg-zinc-50 active:scale-[0.97]"
      >
        Log out
      </button>
    </div>
  );
}

export default function AccountPage() {
  const { isSignedIn, loading } = useAuth();

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      {!loading && (isSignedIn ? <AccountOverview /> : <AuthForm />)}
    </div>
  );
}
