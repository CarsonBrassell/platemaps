"use client";

/**
 * Title block for the feed. The neighbourhood picker that used to live here
 * went away with the Nearby tab — the app header already says San Diego, so a
 * second location control was noise.
 *
 * Create Post is no longer here either: the orange + in the app header is the
 * single doorway to /post, reachable from every screen rather than only this
 * one. The composer below is still the other way in — it starts from a photo,
 * where /post starts from a blank form.
 */
export function FeedHeader() {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        Food Feed
      </h1>
      <p className="mt-1 text-sm text-zinc-500">See what people around you are eating</p>
    </div>
  );
}
