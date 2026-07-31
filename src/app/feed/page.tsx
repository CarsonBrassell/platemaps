"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Leaderboard } from "@/components/Leaderboard";
import { useAuth } from "@/lib/auth";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import { UtensilsIcon, BookmarkIcon, MoreIcon } from "@/components/icons";

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
  authorAvatarUrl?: string;
  text: string;
  restaurant?: string;
  createdAt: string;
  likedBy: string[];
  savedBy: string[];
  comments: Comment[];
};

const demoPosts = [
  {
    id: "d1",
    authorName: "Jordan Ellis",
    time: "3h ago",
    restaurant: "Mariscos German",
    text: "Best fish tacos I've had in years!",
    likeCount: 24,
    comments: [
      { id: "d1c1", authorName: "Maya R.", text: "Need to try this!" },
      { id: "d1c2", authorName: "Chris P.", text: "Their salsa verde is unreal" },
    ],
  },
  {
    id: "d2",
    authorName: "Priya Nair",
    time: "1d ago",
    restaurant: "Communal Coffee",
    text: "Sunday brunch never disappoints.",
    likeCount: 18,
    comments: [{ id: "d2c1", authorName: "Sam K.", text: "Their lattes are perfect" }],
  },
  {
    id: "d3",
    authorName: "Diego Alvarez",
    time: "2d ago",
    restaurant: "Herb and Wood",
    text: "Date night done right.",
    likeCount: 31,
    comments: [
      { id: "d3c1", authorName: "Taylor B.", text: "Adding this to our list" },
      { id: "d3c2", authorName: "Jamie L.", text: "So good" },
    ],
  },
];

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      className={className ?? (filled ? "text-pm-orange" : "text-zinc-500")}
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

function PlusIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ComposeModal({
  isSignedIn,
  onClose,
  onCreated,
}: {
  isSignedIn: boolean;
  onClose: () => void;
  onCreated: (post: Post, pointsEarned: number) => void;
}) {
  const [text, setText] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
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
    onCreated(data.post, data.pointsEarned);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <p className="text-sm font-medium text-zinc-900">New post</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 transition-transform active:scale-90"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4">
          {isSignedIn ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-3 flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-pm-orange-tint">
                <UtensilsIcon className="h-7 w-7 text-pm-orange-text" />
                <span className="text-sm text-pm-orange-text">
                  {restaurant || "Your food photo goes here"}
                </span>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a caption..."
                rows={3}
                className="mb-2 w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none"
              />
              <input
                value={restaurant}
                onChange={(e) => setRestaurant(e.target.value)}
                placeholder="Tag a restaurant (optional)"
                className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none"
              />

              {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">Earn 10 PM Points for posting</p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-pm-orange px-4 py-1.5 text-sm font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-60"
                >
                  Share
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">
              <Link href="/account" className="font-medium text-pm-orange-text">
                Sign in
              </Link>{" "}
              to post to the feed and start earning PM Points.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  currentUserId,
  onLike,
  onSave,
  onComment,
  onDelete,
}: {
  post: Post;
  currentUserId: string | null;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onComment: (postId: string, text: string) => Promise<void>;
  onDelete: (postId: string) => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
  const saved = currentUserId ? post.savedBy.includes(currentUserId) : false;
  const isOwner = currentUserId === post.userId;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    await onComment(post.id, commentText);
    setCommentText("");
    setSubmitting(false);
  }

  function handleDoubleTap() {
    if (!currentUserId) return;
    setShowHeartPop(true);
    if (!liked) onLike(post.id);
    setTimeout(() => setShowHeartPop(false), 800);
  }

  const visibleComments = showAllComments ? post.comments : post.comments.slice(-1);
  const palette = avatarPalette(post.authorName);

  return (
    <div className={`overflow-hidden rounded-xl border-2 ${palette.border} bg-white shadow-sm`}>
      <div className="flex items-center gap-2 p-3">
        {post.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.authorAvatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${palette.avatarBg}`}
          >
            {initials(post.authorName)}
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">{post.authorName}</p>
          <p className="text-xs text-zinc-500">{relativeTime(post.createdAt)}</p>
        </div>
        {isOwner && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Post options"
              className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            >
              <MoreIcon className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-zinc-200 bg-white p-1 shadow-md">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(post.id);
                  }}
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {post.restaurant && (
        <div
          onDoubleClick={handleDoubleTap}
          className="relative flex aspect-[4/3] select-none flex-col items-center justify-center gap-2 bg-pm-orange-tint"
        >
          <UtensilsIcon className="h-7 w-7 text-pm-orange-text" />
          <span className="text-sm font-medium text-pm-orange-text">{post.restaurant}</span>
          {showHeartPop && (
            <HeartIcon
              filled
              className="heart-pop pointer-events-none absolute h-16 w-16 text-pm-orange"
            />
          )}
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
          <button
            onClick={() => onSave(post.id)}
            disabled={!currentUserId}
            aria-label={saved ? "Unsave" : "Save"}
            className="ml-auto transition-transform active:scale-90 disabled:opacity-50"
          >
            <BookmarkIcon
              filled={saved}
              className={saved ? "h-[18px] w-[18px] text-pm-orange" : "h-[18px] w-[18px] text-zinc-500"}
            />
          </button>
        </div>

        <p className="mb-2 text-sm">
          <span className="font-medium">{post.authorName}</span> {post.text}
        </p>

        {post.comments.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {!showAllComments && post.comments.length > 1 && (
              <button
                onClick={() => setShowAllComments(true)}
                className="text-left text-xs text-zinc-500 hover:text-zinc-700"
              >
                View all {post.comments.length} comments
              </button>
            )}
            {visibleComments.map((c) => (
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

function DemoPostCard({ post }: { post: (typeof demoPosts)[number] }) {
  const [liked, setLiked] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [showHeartPop, setShowHeartPop] = useState(false);

  const likeCount = post.likeCount + (liked ? 1 : 0);
  const visibleComments = showAllComments ? post.comments : post.comments.slice(-1);
  const palette = avatarPalette(post.authorName);

  function handleDoubleTap() {
    setShowHeartPop(true);
    setLiked(true);
    setTimeout(() => setShowHeartPop(false), 800);
  }

  return (
    <div className={`overflow-hidden rounded-xl border-2 ${palette.border} bg-white shadow-sm`}>
      <div className="flex items-center gap-2 p-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${palette.avatarBg}`}
        >
          {initials(post.authorName)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{post.authorName}</p>
          <p className="text-xs text-zinc-500">{post.time}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400">
          Example
        </span>
      </div>

      <div
        onDoubleClick={handleDoubleTap}
        className="relative flex aspect-[4/3] select-none flex-col items-center justify-center gap-2 bg-pm-orange-tint"
      >
        <UtensilsIcon className="h-7 w-7 text-pm-orange-text" />
        <span className="text-sm font-medium text-pm-orange-text">{post.restaurant}</span>
        {showHeartPop && (
          <HeartIcon
            filled
            className="heart-pop pointer-events-none absolute h-16 w-16 text-pm-orange"
          />
        )}
      </div>

      <div className="p-3">
        <div className="mb-2 flex items-center gap-4">
          <button
            onClick={() => setLiked((v) => !v)}
            className="flex items-center gap-1.5 transition-transform active:scale-90"
          >
            <HeartIcon filled={liked} />
            <span className="text-sm text-zinc-600">{likeCount}</span>
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
          <div className="flex flex-col gap-1">
            {!showAllComments && post.comments.length > 1 && (
              <button
                onClick={() => setShowAllComments(true)}
                className="text-left text-xs text-zinc-500 hover:text-zinc-700"
              >
                View all {post.comments.length} comments
              </button>
            )}
            {visibleComments.map((c) => (
              <p key={c.id} className="text-sm">
                <span className="font-medium">{c.authorName}</span> {c.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeedPage() {
  const { account, isSignedIn, refresh } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pointsBanner, setPointsBanner] = useState<number | null>(null);
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => setPosts(data.posts));
  }, []);

  useEffect(() => {
    if (pointsBanner === null) return;
    const timeout = setTimeout(() => setPointsBanner(null), 3000);
    return () => clearTimeout(timeout);
  }, [pointsBanner]);

  function handleCreated(post: Post, pointsEarned: number) {
    setPosts((prev) => [post, ...prev]);
    setPointsBanner(pointsEarned);
    setComposeOpen(false);
    refresh();
    setLeaderboardKey((k) => k + 1);
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
    if (data.pointsEarned > 0) {
      refresh();
      setLeaderboardKey((k) => k + 1);
    }
  }

  async function handleSave(postId: string) {
    if (!account) return;
    const res = await fetch(`/api/posts/${postId}/save`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              savedBy: data.saved
                ? [...p.savedBy, account.id]
                : p.savedBy.filter((uid: string) => uid !== account.id),
            }
          : p
      )
    );
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
    setLeaderboardKey((k) => k + 1);
  }

  async function handleDelete(postId: string) {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex justify-center gap-4 bg-white px-5 py-4">
        <div className="flex w-full max-w-md flex-col">
          <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3">
            <p className="text-lg font-medium text-zinc-900">Feed</p>
            <button
              onClick={() => setComposeOpen(true)}
              aria-label="New post"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-all hover:bg-zinc-100 active:scale-90"
            >
              <PlusIcon />
            </button>
          </div>

          {pointsBanner !== null && (
            <p className="mb-3 rounded-lg bg-pm-orange-tint px-3 py-2 text-sm font-medium text-pm-orange-text">
              +{pointsBanner} PM Points earned
            </p>
          )}

          <div className="flex flex-col gap-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={account?.id ?? null}
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onDelete={handleDelete}
              />
            ))}

            {demoPosts.map((post) => (
              <DemoPostCard key={post.id} post={post} />
            ))}
          </div>
        </div>

        <Leaderboard key={leaderboardKey} />
      </div>

      {composeOpen && (
        <ComposeModal
          isSignedIn={isSignedIn}
          onClose={() => setComposeOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
