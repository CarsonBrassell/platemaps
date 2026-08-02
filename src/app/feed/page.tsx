"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { initials, relativeTime } from "@/lib/format";
import { UtensilsIcon, BookmarkIcon, MoreIcon } from "@/components/icons";
import { restaurants } from "@/data/restaurants";
import { regionNames, regionForCoordinate } from "@/data/regions";
import { mapCommentsByRestaurant, type MapComment } from "@/data/mapComments";
import { dishesByRestaurant } from "@/data/dishes";

const RestaurantMap = dynamic(
  () => import("@/components/RestaurantMap").then((mod) => mod.RestaurantMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[540px] w-full items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-400">
        Loading map...
      </div>
    ),
  },
);

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

function hotScore(post: Post) {
  const net = post.likedBy.length;
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000;
  return net / Math.pow(ageHours + 2, 1.5);
}

function bubbleTextFromPost(text: string) {
  const match = text.match(/^@[^;]+;\s*/);
  return match ? text.slice(match[0].length) : text;
}

// Restaurant reviews are prefixed "@Name X stars;" — anything else (plain
// comments, and food reviews handled separately below) has no star rating.
function ratingFromPost(text: string): string | null {
  const stars = text.match(/^@.*?\s(\d)\sstars?;/);
  return stars ? `${stars[1]}★` : null;
}

// Food reviews are prefixed "@Name - Dish X%;" — pulled out so the bubble
// can lead with "Dish X%" highlighted, ahead of whatever else was written.
function dishNameFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s\d{1,3}%;/);
  return match ? match[1] : null;
}

function dishPrefixFromPost(text: string): string | null {
  const match = text.match(/^@.+? - (.+?)\s(\d{1,3})%;/);
  return match ? `${match[1]} ${match[2]}%` : null;
}

function findDishId(restaurantId: string, dishName: string): string | undefined {
  const dishes = dishesByRestaurant[restaurantId] ?? [];
  return dishes.find((d) => d.name.toLowerCase() === dishName.toLowerCase())?.id;
}

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

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-900">New post</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-zinc-500 transition-all hover:bg-zinc-100 active:scale-90"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4">
          {isSignedIn ? (
            <form onSubmit={handleSubmit}>
              <div className="relative mb-3 flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/25">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 25%, rgba(255,255,255,0.7), transparent 40%), radial-gradient(circle at 80% 80%, rgba(181,80,43,0.18), transparent 45%)",
                  }}
                  aria-hidden="true"
                />
                <UtensilsIcon className="relative h-7 w-7 text-pm-orange-text" />
                <span className="relative text-sm text-pm-orange-text">
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
  highlighted,
}: {
  post: Post;
  currentUserId: string | null;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onComment: (postId: string, text: string) => Promise<void>;
  onDelete: (postId: string) => void;
  highlighted?: boolean;
}) {
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [showVotePop, setShowVotePop] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const liked = currentUserId ? post.likedBy.includes(currentUserId) : false;
  const score = post.likedBy.length;
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
    setShowVotePop(true);
    if (!liked) onLike(post.id);
    setTimeout(() => setShowVotePop(false), 800);
  }

  const visibleComments = showAllComments ? post.comments : post.comments.slice(-1);

  return (
    <div
      className={
        highlighted
          ? "card-lift overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm ring-2 ring-pm-orange ring-offset-2 transition-shadow"
          : "card-lift overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow"
      }
    >
      <div className="flex items-center gap-2 p-3">
        {post.authorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.authorAvatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
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
          className="relative flex aspect-[4/3] select-none flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/25"
        >
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 25%, rgba(255,255,255,0.7), transparent 40%), radial-gradient(circle at 80% 80%, rgba(181,80,43,0.18), transparent 45%)",
            }}
            aria-hidden="true"
          />
          <UtensilsIcon className="relative h-7 w-7 text-pm-orange-text" />
          <span className="relative text-sm font-medium text-pm-orange-text">{post.restaurant}</span>
          {showVotePop && (
            <ArrowUpIcon className="heart-pop pointer-events-none absolute h-16 w-16 text-pm-orange" />
          )}
        </div>
      )}

      <div className="p-3">
        <div className="mb-2 flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-full bg-zinc-100/80 px-1.5 py-1 ring-1 ring-inset ring-zinc-200/60">
            <button
              onClick={() => onLike(post.id)}
              disabled={!currentUserId}
              aria-label={liked ? "Unlike" : "Like"}
              aria-pressed={liked}
              className="transition-transform active:scale-90 disabled:opacity-50"
            >
              <ArrowUpIcon className={liked ? "text-pm-orange" : "text-zinc-400"} />
            </button>
            <span
              className={
                score > 0
                  ? "min-w-[1.5rem] text-center text-sm font-semibold text-pm-orange-text"
                  : "min-w-[1.5rem] text-center text-sm font-semibold text-zinc-600"
              }
            >
              {score}
            </span>
          </div>
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

export default function FeedPage() {
  return (
    <Suspense fallback={null}>
      <FeedPageInner />
    </Suspense>
  );
}

function FeedPageInner() {
  const { account, isSignedIn, refresh } = useAuth();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const [posts, setPosts] = useState<Post[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pointsBanner, setPointsBanner] = useState<number | null>(null);
  const [view, setView] = useState<"feed" | "map">("feed");
  const [selectedRegion, setSelectedRegion] = useState("Downtown");
  const [highlightedPost, setHighlightedPost] = useState<string | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/posts")
      .then((res) => res.json())
      .then((data) => setPosts(data.posts));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation || highlightPostId) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedRegion(regionForCoordinate(position.coords.latitude, position.coords.longitude));
      },
      () => {
        // Permission denied or unavailable — keep the Downtown default.
      },
      { timeout: 5000 },
    );
  }, [highlightPostId]);

  // Deep link from a map comment bubble ("view this comment in the feed") —
  // jump to Feed view, the post's region, and scroll it into view with a
  // brief highlight ring.
  useEffect(() => {
    if (!highlightPostId || posts.length === 0) return;
    const post = posts.find((p) => p.id === highlightPostId);
    if (!post) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView("feed");
    const region = restaurantRegion(post.restaurant);
    if (region) setSelectedRegion(region);
    setHighlightedPost(highlightPostId);
    const scrollTimeout = setTimeout(() => {
      postRefs.current[highlightPostId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clearTimeout_ = setTimeout(() => setHighlightedPost(null), 3000);
    return () => {
      clearTimeout(scrollTimeout);
      clearTimeout(clearTimeout_);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPostId, posts]);

  useEffect(() => {
    chipRefs.current[selectedRegion]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedRegion]);

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
                ? [...p.likedBy.filter((uid: string) => uid !== account.id), account.id]
                : p.likedBy.filter((uid: string) => uid !== account.id),
            }
          : p
      )
    );
    if (data.pointsEarned > 0) refresh();
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
  }

  async function handleDelete(postId: string) {
    const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    if (!res.ok) return;
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function restaurantRegion(name?: string) {
    const restaurant = name ? restaurants.find((r) => r.name === name) : undefined;
    return restaurant ? regionForCoordinate(restaurant.lat, restaurant.lng) : undefined;
  }

  function activityRegion(place: string) {
    return restaurantRegion(place.split(" · ")[0]);
  }

  const filteredPosts = posts
    .filter((p) => restaurantRegion(p.restaurant) === selectedRegion)
    .sort((a, b) => hotScore(b) - hotScore(a));
  const filteredActivity = activity.filter((item) => activityRegion(item.place) === selectedRegion);

  // Real posted comments/reviews show up on the map first, most-liked first,
  // followed by the seeded flavor comments as filler.
  const mapComments: Record<string, MapComment[]> = {};
  for (const restaurant of restaurants) {
    const real: MapComment[] = posts
      .filter((p) => p.restaurant === restaurant.name)
      .map((p) => {
        const dishName = dishNameFromPost(p.text);
        return {
          id: p.id,
          restaurantId: restaurant.id,
          text: bubbleTextFromPost(p.text),
          score: p.likedBy.length,
          upvotes: p.likedBy.length,
          createdAt: p.createdAt,
          rating: ratingFromPost(p.text),
          dishPrefix: dishPrefixFromPost(p.text),
          postId: p.id,
          dishId: dishName ? findDishId(restaurant.id, dishName) : undefined,
        };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    mapComments[restaurant.id] = [...real, ...(mapCommentsByRestaurant[restaurant.id] ?? [])];
  }

  return (
    <div className="app-shell mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />
      <div className="flex w-full flex-col bg-white px-5 py-4">
        <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200/60">
            <button
              onClick={() => setView("feed")}
              className={
                view === "feed"
                  ? "rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-900 shadow-sm transition-transform active:scale-95"
                  : "rounded-full px-3 py-1 text-sm text-zinc-500 transition-all hover:text-zinc-700 active:scale-95"
              }
            >
              Feed
            </button>
            <button
              onClick={() => setView("map")}
              className={
                view === "map"
                  ? "rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-900 shadow-sm transition-transform active:scale-95"
                  : "rounded-full px-3 py-1 text-sm text-zinc-500 transition-all hover:text-zinc-700 active:scale-95"
              }
            >
              Map view
            </button>
          </div>
          {view === "feed" && (
            <button
              onClick={() => setComposeOpen(true)}
              aria-label="New post"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-all hover:bg-zinc-100 active:scale-90"
            >
              <PlusIcon />
            </button>
          )}
        </div>

        {pointsBanner !== null && (
          <p className="mb-3 rounded-lg bg-pm-orange-tint px-3 py-2 text-sm font-medium text-pm-orange-text">
            +{pointsBanner} PM Points earned
          </p>
        )}

        {view === "feed" && (
          <div className="mb-3 flex flex-wrap gap-2">
            {regionNames.map((region) => (
              <button
                key={region}
                ref={(el) => {
                  chipRefs.current[region] = el;
                }}
                onClick={() => setSelectedRegion(region)}
                className={
                  region === selectedRegion
                    ? "shrink-0 rounded-full bg-pm-orange-tint px-3 py-1.5 text-sm font-medium text-pm-orange-text transition-transform active:scale-95"
                    : "shrink-0 rounded-full bg-pm-grey-tint px-3 py-1.5 text-sm text-pm-grey-text transition-all hover:bg-pm-orange-tint/60 hover:text-pm-orange-text active:scale-95"
                }
              >
                {region}
              </button>
            ))}
          </div>
        )}

        {view === "map" ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
            <RestaurantMap restaurants={restaurants} commentsByRestaurant={mapComments} />
          </div>
        ) : (
          <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                ref={(el) => {
                  postRefs.current[post.id] = el;
                }}
              >
                <PostCard
                  post={post}
                  currentUserId={account?.id ?? null}
                  onLike={handleLike}
                  onSave={handleSave}
                  onComment={handleComment}
                  onDelete={handleDelete}
                  highlighted={post.id === highlightedPost}
                />
              </div>
            ))}

            {filteredActivity.map((item) => (
              <div
                key={item.id}
                className="card-lift flex gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pm-orange-tint text-pm-orange-text">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                  </svg>
                </span>
                <div>
                  <p className="mb-1 text-sm">{item.text}</p>
                  <p className="text-xs text-zinc-500">
                    {item.place} &middot; {item.time}
                  </p>
                </div>
              </div>
            ))}

            {filteredPosts.length === 0 && filteredActivity.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-zinc-400">
                Nothing in {selectedRegion} yet.
              </p>
            )}
          </div>
        )}
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
