"use client";

import { useState } from "react";
import type { PostMedia } from "@/components/feed/types";

/**
 * The small square photo on a non-featured feed card.
 *
 * Not `PostMediaCarousel`: that component is a full-width 16:9 swipe track with
 * arrows, dots and a slide counter, none of which survives being shrunk to 96px
 * — and a swipeable 96px box inside a vertical scroller is a gesture fight for
 * no gain. The first item stands for the set here; the rest are one tap away in
 * the post's own screen.
 *
 * A failed image falls back to the warm tone block the rest of the app uses for
 * a missing photo, never a grey box or an icon (DESIGN.md, Photos). The block is
 * the element's own background, so it is already behind the image and simply
 * shows through once the `<img>` is dropped.
 */
export function PhoneFeedCardThumb({ item, alt }: { item: PostMedia; alt: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--pm-tone-1)]">
      {item.type === "video" ? (
        /* Poster frame only — muted, never played, no controls. `preload
           ="metadata"` is what paints the first frame without pulling the
           file. */
        <video
          src={item.url}
          muted
          playsInline
          preload="metadata"
          aria-label={alt}
          className="h-full w-full object-cover"
        />
      ) : failed ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </div>
  );
}
