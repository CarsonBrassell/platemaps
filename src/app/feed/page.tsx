"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { initials, relativeTime } from "@/lib/format";

type Comment = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

type Post = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  restaurant?: string;
  createdAt: string;
  likedBy: string[];
  comments: Comment[];
};

const activity = [
  {
    id: "a1",
    text: "Karina's Tacos just posted a special: fish taco plate, $12",
    place: "Karina's Tacos · Ocean Beach",
    time: "12m ago",
  },
  {
    id: "a2",
    text: "Mariscos German is running with no wait right now",
    place: "Mariscos German · Barrio Logan",
    time: "28m ago",
  },
  {
    id: "a3",
    text: "5 people checked in at Communal Coffee in the last hour",
    place: "Communal Coffee · North Park",
    time: "1h ago",
  },
  {
    id: "a4",
    text: "Herb and Wood is filling up, wait climbing to 25 min",
    place: "Herb and Wood · Little Italy",
    time: "2h ago",
  },
];

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      className={filled ? "text-pm-orange" : "text-zinc-500"}
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-zinc-500"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function UtensilsIcon() {
  return (
    <svg
      width="28"
      height="28"
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

function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
}: {
  post: Post;
  currentUserId: string | null;
  onLike: (postId: string) => void;
  onComment: (postId: string, text: string) => Promise<void>;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onComment(post.id, commentText);
    setCommentText("");
    setSubmitting(false);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
          {initials(post.authorName)}
        </div>
        <div>
          <p className="text-sm font-medium">{post.authorName}</p>
          <p className="text-xs text-zinc-500">{relativeTime(post.createdAt)}</p>
        </div>
      </div>

      {post.restaurant && (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-pm-orange-tint">
          <UtensilsIcon />
          <span className="text-sm font-medium text-pm-orange-text">{post.restaurant}</span>
        </div>
      )}

      <div className="p-3">
        <div className="mb-2 flex items-center gap-4">
          <button
            onClick={() => onLike(post.id)}
            disabled={!currentUserId}
            className="flex items-center gap-1.5 transition-transform active:scale-90 disabled:opacity-50"
          >
            <HeartIcon filled={liked} />
            <span className="text-sm text-zinc-600">{post.likedBy.length}</span>
          </button>
          <div className="flex items-center gap-1.5">
            <CommentIcon />
            <span className="text-sm text-zinc-600">{post.comments.length}</span>
          </div>
        </div>

        <p className="mb-2 text-sm">
          <span className="font-medium">{post.authorName}</span> {post.text}
        </p>

        {post.comments.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {post.comments.map((c) => (
              <p key={c.id} className="text-sm">
                <span className="font-medium">{c.authorName}</span> {c.text}
              </p>
            ))}
          </div>
        )}

        {currentUserId && (
          <form
            onSubmit={handleComment}
            className="flex items-center gap-2 border-t border-zinc-100 pt-2"
          >
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 text-sm outline-none placeholder:text-zinc-400"
            />
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              className="text-sm font-medium text-pm-orange-text transition-transform active:scale-95 disabled:opacity-40"
            >
              Post
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { account, isSignedIn, refresh } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [error, setError] = useState("");
  const [pointsEarned, setPointsEarned] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => setPosts(data.posts));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPointsEarned(null);
    if (!text.trim()) {
      setError("Write something to post.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, restaurant: restaurant || undefined }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setPosts((prev) => [data.post, ...prev]);
    setPointsEarned(data.pointsEarned);
    setText("");
    setRestaurant("");
    refresh();
  }

  async function handleLike(postId: string) {
    if (!account) return;
    const res = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedBy: data.liked
                ? [...p.likedBy, account.id]
                : p.likedBy.filter((uid: string) => uid !== account.id),
            }
          : p
      )
    );
    if (data.pointsEarned > 0) refresh();
  }

  async function handleComment(postId: string, commentText: string) {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: commentText }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: [...p.comments, data.comment] } : p
      )
    );
    refresh();
  }

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="mx-auto flex max-w-md flex-col gap-3 bg-white px-5 py-4">
        {isSignedIn ? (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share a find, a wait time, a special..."
              rows={2}
              className="mb-2 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none"
            />
            <input
              value={restaurant}
              onChange={(e) => setRestaurant(e.target.value)}
              placeholder="Tag a restaurant (optional)"
              className="mb-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">Earn 10 PM Points for posting</p>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-pm-orange px-3 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-60"
              >
                Post
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {pointsEarned !== null && (
              <p className="mt-2 text-sm font-medium text-pm-orange-text">
                +{pointsEarned} PM Points earned
              </p>
            )}
          </form>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500 shadow-sm">
            <Link href="/account" className="font-medium text-pm-orange-text">
              Sign in
            </Link>{" "}
            to post, like, and comment - and start earning PM Points.
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={account?.id ?? null}
            onLike={handleLike}
            onComment={handleComment}
          />
        ))}

        {activity.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <p className="mb-1 text-sm">{item.text}</p>
            <p className="text-xs text-zinc-500">
              {item.place} &middot; {item.time}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
