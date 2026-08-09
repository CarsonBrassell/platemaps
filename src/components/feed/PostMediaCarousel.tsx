"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UtensilsIcon, ChevronIcon, PlayIcon } from "@/components/icons";
import type { PostMedia } from "./types";

/** Warm gradient stand-in used when a post has no media, or its image 404s. */
function MediaFallback({ label }: { label?: string }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-pm-orange-tint via-orange-100 to-pm-orange/25">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 25%, rgba(255,255,255,0.7), transparent 40%), radial-gradient(circle at 80% 80%, rgba(181,80,43,0.18), transparent 45%)",
        }}
        aria-hidden="true"
      />
      <UtensilsIcon className="relative h-8 w-8 text-pm-orange-text" />
      {label && (
        <span className="relative px-6 text-center text-sm font-medium text-pm-orange-text">
          {label}
        </span>
      )}
    </div>
  );
}

function VideoSlide({ item, active }: { item: PostMedia; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Swiping to another slide stops playback rather than leaving audio running
  // off-screen.
  useEffect(() => {
    if (!active && ref.current && !ref.current.paused) {
      ref.current.pause();
      setPlaying(false);
    }
  }, [active]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause video" : "Play video"}
      className="group relative block h-full w-full bg-pm-charcoal focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange"
    >
      <video
        ref={ref}
        src={item.url}
        playsInline
        loop
        muted
        preload="metadata"
        className="h-full w-full object-cover"
      />
      {!playing && (
        <span className="absolute inset-0 flex items-center justify-center bg-pm-charcoal/25">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-pm-charcoal shadow-lg transition-transform group-hover:scale-105">
            <PlayIcon className="ml-0.5 h-6 w-6" />
          </span>
        </span>
      )}
    </button>
  );
}

/**
 * Swipeable media track. Uses native scroll-snap for the gesture (so touch
 * momentum feels right and no drag library is needed) and syncs the dots
 * from scroll position.
 */
export function PostMediaCarousel({
  media,
  dishName,
  restaurant,
}: {
  media: PostMedia[];
  dishName?: string;
  restaurant?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  if (media.length === 0) {
    return (
      <div className="aspect-[16/9] w-full select-none">
        <MediaFallback label={restaurant ?? dishName} />
      </div>
    );
  }

  const single = media.length === 1;
  const describe = (item: PostMedia, i: number) =>
    item.alt ??
    [dishName, restaurant && `at ${restaurant}`].filter(Boolean).join(" ") ??
    `Photo ${i + 1}`;

  return (
    <div className="group/media relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className={`snap-track flex aspect-[16/9] w-full overflow-x-auto ${
          single ? "overflow-x-hidden" : ""
        }`}
        role={single ? undefined : "group"}
        aria-label={single ? undefined : `${media.length} photos, swipe to browse`}
      >
        {media.map((item, i) => (
          <div key={`${item.url.slice(0, 32)}-${i}`} className="snap-item h-full w-full shrink-0">
            {item.type === "video" ? (
              <VideoSlide item={item} active={i === index} />
            ) : failed[i] ? (
              <MediaFallback label={restaurant ?? dishName} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={describe(item, i) || "Food photo"}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                onError={() => setFailed((prev) => ({ ...prev, [i]: true }))}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

      {!single && (
        <>
          {index > 0 && (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pm-charcoal shadow-md transition-opacity hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:flex sm:opacity-0 sm:group-hover/media:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronIcon className="h-5 w-5 rotate-180" />
            </button>
          )}
          {index < media.length - 1 && (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-pm-charcoal shadow-md transition-opacity hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange sm:flex sm:opacity-0 sm:group-hover/media:opacity-100 sm:focus-visible:opacity-100"
            >
              <ChevronIcon className="h-5 w-5" />
            </button>
          )}

          <div className="absolute right-3 top-3 rounded-full bg-pm-charcoal/65 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {index + 1}/{media.length}
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {media.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
