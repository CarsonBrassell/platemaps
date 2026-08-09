"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { HeartIcon, ChatIcon } from "@/components/icons";
import { initials, relativeTime, avatarPalette } from "@/lib/format";
import type { Post } from "./types";

function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function CommentsPanel({
  post,
  currentUserId,
  onClose,
  onSubmit,
  onLikeComment,
}: {
  post: Post;
  currentUserId: string | null;
  onClose: () => void;
  onSubmit: (postId: string, text: string) => Promise<string | null>;
  onLikeComment: (postId: string, commentId: string) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const failure = await onSubmit(post.id, text.trim());
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    setText("");
  }

  const composer = currentUserId ? (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <label htmlFor="comment-input" className="sr-only">
        Add a comment
      </label>
      <input
        id="comment-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a comment…"
        maxLength={1000}
        className="min-h-11 flex-1 rounded-full bg-pm-grey-tint/60 px-4 text-sm transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
      />
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="min-h-11 shrink-0 rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
      >
        {submitting ? "Posting…" : "Post"}
      </button>
    </form>
  ) : (
    <p className="text-sm text-zinc-500">
      <Link
        href="/account"
        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
      >
        Sign in
      </Link>{" "}
      to join the conversation.
    </p>
  );

  return (
    <Dialog
      title={`Comments · ${post.dishName ?? post.restaurant ?? "Plate"}`}
      onClose={onClose}
      variant="panel"
      footer={
        <>
          {error && (
            <p role="alert" className="mb-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {composer}
        </>
      }
    >
      {post.comments.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-pm-grey-tint text-pm-grey-text">
            <ChatIcon className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-zinc-800">No comments yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Be the first to say something about this plate.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {post.comments.map((comment) => {
            const palette = avatarPalette(comment.authorName);
            const liked = currentUserId ? comment.likedBy.includes(currentUserId) : false;
            return (
              <li key={comment.id} className="flex gap-3 px-5 py-3.5">
                {comment.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={comment.authorAvatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${palette.avatarBg} font-mono text-[11px] font-semibold text-white`}
                  >
                    {initials(comment.authorName)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-zinc-800">
                    <span className="font-mono text-[13px] font-medium text-zinc-900">
                      {handleFor(comment.authorName)}
                    </span>{" "}
                    {comment.text}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">
                    {relativeTime(comment.createdAt)}
                    {comment.likedBy.length > 0 &&
                      ` · ${comment.likedBy.length} ${
                        comment.likedBy.length === 1 ? "like" : "likes"
                      }`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onLikeComment(post.id, comment.id)}
                  disabled={!currentUserId}
                  aria-pressed={liked}
                  aria-label={liked ? "Unlike comment" : "Like comment"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                >
                  <HeartIcon
                    filled={liked}
                    className={`h-4 w-4 ${liked ? "text-pm-orange" : ""}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
