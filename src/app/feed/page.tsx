"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";

type Post = {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
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

export default function FeedPage() {
  const { isSignedIn, refresh } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
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
      body: JSON.stringify({ text }),
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
    refresh();
  }

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex flex-col gap-3 bg-white px-5 py-4">
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
            to post to the feed and start earning PM Points.
          </div>
        )}

        {posts.map((post) => (
          <div
            key={post.id}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <p className="mb-1 text-sm">{post.text}</p>
            <p className="text-xs text-zinc-500">
              {post.authorName} &middot; just now
            </p>
          </div>
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
