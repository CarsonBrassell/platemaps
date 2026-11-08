"use client";

import { useCallback, useState } from "react";
import { preload } from "react-dom";

type ShimmerImageProps = {
  src: string;
  alt?: string;
  /** Classes on the image itself: `object-cover`, hover transforms. */
  className?: string;
  /** Layout hint, as on `next/image`. */
  sizes?: string;
  /** Above-the-fold: preloaded, high priority, never lazy. */
  priority?: boolean;
  /** Ignored when `priority` is set. */
  loading?: "lazy" | "eager";
  draggable?: boolean;
};

/**
 * A photo that can never show the browser's broken-image icon.
 *
 * Covers come from hosts we do not run and any of them can fail. iOS paints a
 * failed `<img>` as a blue box with a question mark, and every other browser
 * has its own version, so the image stays invisible until it has real pixels
 * and leaves the DOM if it never will. The shimmer stands in for both, and
 * after a failure it stays: a dead photo looks like one still on its way.
 *
 * Fills its parent, like `next/image` with `fill`: the parent must be
 * positioned and have a height or aspect ratio.
 *
 * A plain `<img>`, not `next/image`. Everything that reaches this is fetched
 * directly by the browser anyway (see `RestaurantPhoto`), and `next/image`
 * throws on a `src` it dislikes, such as one with stray whitespace, which
 * would take the page down over one bad row. A bad URL here is only a failed
 * image, which is the case this component exists for.
 */
export function ShimmerImage({
  src,
  alt = "",
  className = "",
  sizes,
  priority = false,
  loading = "lazy",
  draggable,
}: ShimmerImageProps) {
  /* The result is stored with the `src` it belongs to, so a new `src` reads as
     unsettled during the render that brings it. An effect resetting a flag
     would paint one frame of the old result, and could not tell a late event
     from the previous photo apart from one about this photo. */
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(null);
  const result = settled?.src === src ? settled.ok : null;

  // What `next/image` does for `priority`: a hint in the server's HTML.
  if (priority) preload(src, { as: "image", fetchPriority: "high" });

  /* An image can finish before hydration attaches `onLoad` and `onError`, and
     then neither ever fires, so this reads the outcome off the element. A ref
     callback rather than an effect because it runs before paint, which is what
     stops a cached photo flashing the shimmer on a client render. */
  const checkAlreadyFinished = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img?.complete) return;
      if (img.naturalWidth > 0) {
        setSettled({ src, ok: true });
        return;
      }
      /* `complete` with no pixels usually means it failed, but it is also what
         an SVG with no intrinsic size reports, and declaring a good photo dead
         is permanent. A separate attempt ends in an event, so ask that. */
      const attempt = new Image();
      attempt.onload = () => setSettled({ src, ok: true });
      attempt.onerror = () => setSettled({ src, ok: false });
      attempt.src = src;
    },
    [src],
  );

  return (
    <>
      {result !== true && (
        /* The position is inline because `.skeleton` sets `position: relative`
           outside Tailwind's layers, so it beats an `absolute` class. */
        <span
          className="skeleton"
          style={{ position: "absolute", inset: 0 }}
          {...(result === false && alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
        />
      )}
      {result !== false && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          /* Keyed so a reused row starts from a new element: the old one would
             keep showing the previous photo while this one loads. */
          key={src}
          ref={checkAlreadyFinished}
          src={src}
          alt={alt}
          sizes={sizes}
          loading={priority ? "eager" : loading}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          draggable={draggable}
          onLoad={() => setSettled({ src, ok: true })}
          onError={() => setSettled({ src, ok: false })}
          /* `opacity-0`, not `hidden`: a `display: none` image would never
             lazy-load, so it would never finish. */
          className={`absolute inset-0 h-full w-full ${className} ${result === true ? "" : "opacity-0"}`}
        />
      )}
    </>
  );
}
