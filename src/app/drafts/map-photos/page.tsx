import { getPosts } from "@/lib/db";
import { MapPhotoOptions, type SamplePost } from "./MapPhotoOptions";

/**
 * DRAFT — three ways a map bubble could show its photo, side by side, using
 * real public posts (getPosts with no viewer, so the photo gate still applies).
 * Deleting this folder removes it; nothing else imports it.
 */
export const dynamic = "force-dynamic";

export default async function MapPhotosDraft() {
  const posts = await getPosts(null);
  const toSample = (p: (typeof posts)[number]): SamplePost => ({
    id: p.id,
    dish: p.dishName ?? p.restaurant ?? "",
    prose: p.text.slice(0, 140),
    score:
      p.rating === undefined
        ? null
        : p.ratingKind === "restaurant"
          ? `${p.rating}/5`
          : `${p.rating}%`,
    author: p.authorName.trim().toLowerCase().replace(/\s+/g, ""),
    restaurant: p.restaurant ?? "",
    votes: p.upvoteCount - p.downvoteCount,
    photo: p.media.find((m) => m.type === "image" && m.url)?.url ?? null,
  });
  const withPhoto = posts.filter((p) => p.media.some((m) => m.type === "image" && m.url));
  const without = posts.filter((p) => !p.media.some((m) => m.type === "image" && m.url));
  const samples = [...withPhoto.slice(0, 3), ...without.slice(0, 1)].map(toSample);
  return <MapPhotoOptions samples={samples} />;
}
