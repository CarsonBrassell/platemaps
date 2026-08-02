"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { initials, relativeTime } from "@/lib/format";
import { StarIcon } from "@/components/icons";
import type { Restaurant } from "@/data/restaurants";
import type { Dish } from "@/data/dishes";

type Post = {
  id: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  restaurant?: string;
  createdAt: string;
};

type Stage =
  | "idle"
  | "type"
  | "reviewKind"
  | "starPicker"
  | "dishPicker"
  | "dishPercent"
  | "compose";

export function RestaurantComments({
  restaurant,
  dishes,
}: {
  restaurant: Restaurant;
  dishes: Dish[];
}) {
  const { isSignedIn, refresh } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [mode, setMode] = useState<"comment" | "review" | null>(null);
  const [reviewKind, setReviewKind] = useState<"restaurant" | "food" | null>(null);
  const [rating, setRating] = useState(5);
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null);
  const [dishPercent, setDishPercent] = useState(50);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) =>
        setPosts((data.posts as Post[]).filter((p) => p.restaurant === restaurant.name)),
      );
  }, [restaurant.name]);

  function reset() {
    setStage("idle");
    setMode(null);
    setReviewKind(null);
    setRating(5);
    setSelectedDish(null);
    setDishPercent(50);
    setText("");
    setError("");
  }

  function previewPrefix() {
    if (mode !== "review") return null;
    if (reviewKind === "restaurant") {
      return `@${restaurant.name} ${rating} star${rating === 1 ? "" : "s"};`;
    }
    if (reviewKind === "food" && selectedDish) {
      return `@${restaurant.name} - ${selectedDish.name} ${dishPercent}%;`;
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }
    setSubmitting(true);
    setError("");
    const prefix = previewPrefix();
    const finalText = prefix ? `${prefix} ${text.trim()}` : text.trim();

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalText, restaurant: restaurant.name }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setPosts((prev) => [data.post, ...prev]);
    refresh();
    reset();
  }

  return (
    <div className="border-t border-zinc-100 px-5 py-5">
      <p className="mb-3 flex items-center gap-1.5 text-base font-bold text-zinc-900">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Comments &amp; reviews
      </p>

      {!isSignedIn ? (
        <p className="mb-4 text-sm text-zinc-500">
          <Link href="/account" className="font-medium text-pm-orange-text">
            Sign in
          </Link>{" "}
          to comment or leave a review.
        </p>
      ) : stage === "idle" ? (
        <button
          onClick={() => setStage("type")}
          className="mb-4 w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-400 transition-all hover:border-pm-orange-border hover:bg-pm-orange-tint/20"
        >
          Add a comment or review...
        </button>
      ) : stage === "type" ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-700">
            Would you like to leave a review or just comment?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMode("review");
                setStage("reviewKind");
              }}
              className="flex-1 rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]"
            >
              Review
            </button>
            <button
              onClick={() => {
                setMode("comment");
                setStage("compose");
              }}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-transform active:scale-[0.97]"
            >
              Just comment
            </button>
          </div>
          <button onClick={reset} className="text-left text-xs text-zinc-400 hover:text-zinc-600">
            Cancel
          </button>
        </div>
      ) : stage === "reviewKind" ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-700">Restaurant review or food review?</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setReviewKind("restaurant");
                setStage("starPicker");
              }}
              className="flex-1 rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]"
            >
              Restaurant review
            </button>
            <button
              onClick={() => {
                setReviewKind("food");
                setStage("dishPicker");
              }}
              className="flex-1 rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]"
            >
              Food review
            </button>
          </div>
          <button onClick={reset} className="text-left text-xs text-zinc-400 hover:text-zinc-600">
            Cancel
          </button>
        </div>
      ) : stage === "starPicker" ? (
        <div className="mb-4 flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-700">How many stars?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setRating(n);
                  setStage("compose");
                }}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="transition-transform hover:scale-110 active:scale-90"
              >
                <StarIcon className="h-10 w-10 text-pm-orange drop-shadow-sm" />
              </button>
            ))}
          </div>
          <div className="flex w-full justify-between text-xs text-zinc-400">
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
          </div>
          <button onClick={reset} className="text-xs text-zinc-400 hover:text-zinc-600">
            Cancel
          </button>
        </div>
      ) : stage === "dishPicker" ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-700">Which dish?</p>
          <div className="flex max-h-64 flex-col divide-y divide-zinc-100 overflow-y-auto">
            {dishes.map((dish) => (
              <button
                key={dish.id}
                onClick={() => {
                  setSelectedDish(dish);
                  setDishPercent(50);
                  setStage("dishPercent");
                }}
                className="flex items-center justify-between gap-4 py-2 text-left text-sm transition-colors hover:text-pm-orange-text"
              >
                <span className="text-zinc-700">{dish.name}</span>
                <span className="shrink-0 text-zinc-400">{dish.price}</span>
              </button>
            ))}
          </div>
          <button onClick={reset} className="text-left text-xs text-zinc-400 hover:text-zinc-600">
            Cancel
          </button>
        </div>
      ) : stage === "dishPercent" && selectedDish ? (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-700">
            How likely would you get {selectedDish.name} again?
          </p>
          <p className="text-center text-3xl font-extrabold tabular-nums text-pm-orange-text">
            {dishPercent}%
          </p>
          <input
            type="range"
            min={0}
            max={100}
            value={dishPercent}
            onChange={(e) => setDishPercent(Number(e.target.value))}
            className="w-full accent-pm-orange"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStage("dishPicker")}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Back
            </button>
            <button
              onClick={() => setStage("compose")}
              className="rounded-lg bg-pm-orange px-4 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97]"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 shadow-sm"
        >
          {previewPrefix() && <p className="text-xs text-zinc-400">{previewPrefix()} ...</p>}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "review" ? "How was it?" : "Add a comment..."}
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={reset}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-pm-orange px-4 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              Post
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-1">
        {posts.length === 0 ? (
          <p className="text-sm text-zinc-400">No comments yet — be the first.</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="flex gap-2.5 rounded-lg px-1 py-2 transition-colors hover:bg-zinc-50">
              {post.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.authorAvatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-zinc-100"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white ring-1 ring-zinc-100">
                  {initials(post.authorName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{post.authorName}</span> {post.text}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">{relativeTime(post.createdAt)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
