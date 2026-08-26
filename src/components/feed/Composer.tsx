"use client";

import { useState, type FormEvent } from "react";

/**
 * One text field and a send button: the comment thread's own composer, every
 * inline reply in it, and the reply box on a post in the dish sheet. Each
 * instance owns its own draft, so typing a reply in one thread and then
 * opening another doesn't carry the text across.
 *
 * Its own file rather than a helper inside `CommentsScreen` because the dish
 * sheet needs it and does not need the other 600 lines of that module — a
 * bottom sheet on a restaurant page should not pull the whole threaded reader
 * into its bundle to draw one input.
 */
export function Composer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<string | null>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const failure = await onSubmit(text.trim());
    setSubmitting(false);
    if (failure) {
      setError(failure);
      return;
    }
    setText("");
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`composer-${submitLabel}-${placeholder}`}>
          {placeholder}
        </label>
        <input
          id={`composer-${submitLabel}-${placeholder}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          maxLength={1000}
          // Only ever true on an inline reply box, which exists because the
          // reader just asked for it — the focus goes where they were headed.
          autoFocus={autoFocus}
          /* `min-w-0` is load-bearing, not tidying. A flex item defaults to
             `min-width: auto`, and an <input>'s intrinsic width is its `size`
             attribute — about 170px — so `flex-1` could grow this field but
             never shrink it below that. In the dish sheet, where the row sits
             behind an avatar and an indent inside a 390px sheet, the field
             held its floor and pushed "Reply" off the edge, giving the phone
             frame a horizontal scrollbar. */
          className="min-h-11 w-0 min-w-0 flex-1 rounded-full bg-pm-grey-tint/60 px-4 text-sm transition-colors placeholder:text-pm-grey-text focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange"
        />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="min-h-11 shrink-0 rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          {submitting ? "Posting…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
