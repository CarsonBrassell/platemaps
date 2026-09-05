import Image from "next/image";
import type { ReactNode } from "react";

type RestaurantPhotoProps = {
  photo?: string;
  photoAlt?: string;
  /** Rendered when the restaurant has no photo yet. */
  fallback: ReactNode;
  /** Layout hint for the optimizer — what width this slot occupies per breakpoint. */
  sizes: string;
  /** Set on above-the-fold photos so they are not lazy-loaded. */
  priority?: boolean;
  /** Extra classes on the image itself — used for hover transforms. */
  className?: string;
};

/**
 * Renders a restaurant photo when one exists, and the caller's placeholder
 * when it doesn't — so photos can be added one restaurant at a time instead
 * of all at once.
 *
 * Uses `fill`, so every call site must position its container `relative` and
 * give it a height (or aspect ratio). All three currently do.
 */
export function RestaurantPhoto({
  photo,
  photoAlt,
  fallback,
  sizes,
  priority,
  className = "",
}: RestaurantPhotoProps) {
  if (!photo) return <>{fallback}</>;

  return (
    <Image
      src={photo}
      /* Defaults to decorative: every call site already renders the restaurant
         name as adjacent text, so a generic alt would just make a screen reader
         announce the name twice. Set `photoAlt` in the data when a photo shows
         something the surrounding text doesn't. */
      alt={photoAlt ?? ""}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );
}

/**
 * What a restaurant with no cover says instead.
 *
 * Most listed restaurants have none. The Google photos were removed because
 * they could not be used honestly — wrong attribution, and terms that do not
 * allow warehousing their URLs — and Yelp only ever covered a slice. So an
 * empty cover is the common case, not the exception, and a bare tone block
 * repeated down a list reads as a broken app rather than an open invitation.
 *
 * It is phrased as a job rather than a status. "No photo" describes the
 * database; "be the first" describes what the reader can do about it, and
 * they are the only ones who can — the first plate posted here becomes this
 * restaurant's cover (see `createPost`).
 *
 * Not a link or a button. Every surface that renders this is already inside
 * one `<Link>` to the restaurant, and nesting anchors is invalid HTML that
 * breaks keyboard navigation. It is a label on a target that is already
 * clickable.
 *
 * `--pm-grey-text` rather than `zinc-500`, which fails 4.5:1 on the warm tone
 * blocks these sit on.
 */
export function PostFirstPlate({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center text-[color:var(--pm-grey-text)] ${
        compact ? "text-[11px]" : "text-[13px]"
      }`}
    >
      <PlateGlyph className={compact ? "h-4 w-4 opacity-55" : "h-5 w-5 opacity-55"} />
      {/* The compact wording is not "Be the first", which `plateScoreLabel`
          already uses on these same cards for an unrated restaurant. Two
          different "Be the first"s within an inch of each other is the kind
          of thing a reader notices and cannot unsee. The action is the same
          either way — one post gives a restaurant both its first score and
          its first photo. */}
      <span className="font-medium leading-snug">
        {compact ? "Post a plate" : "Post a plate to be the first"}
      </span>
    </span>
  );
}

/* An empty plate: two circles. Drawn here rather than pulled from the icon set
   because nothing else needs it, and at 16px a rim and a well is the whole
   idea — anything more detailed just turns to mud. */
function PlateGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Who took this photo, if anyone needs crediting.
 *
 * Derived from the URL's host rather than a stored column, because the host
 * *is* the fact — a yelpcdn.com URL is a Yelp photo whatever a column says,
 * and the two cannot drift.
 *
 * This exists because every surface used to print "Photo: Yelp" beside any
 * photo at all, unconditionally. That was already wrong for the ~4,000 Google
 * photos it labelled, and it would be wrong again the moment a diner's own
 * plate became a cover — crediting Yelp for a photo someone took themselves.
 *
 * Our own blob store returns null: a user's photo needs no third-party
 * credit, and the post it came from already carries their name.
 */
export function photoCredit(url?: string): "Yelp" | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("yelpcdn.com") || host.endsWith("yelp.com")) return "Yelp";
    return null;
  } catch {
    return null;
  }
}
