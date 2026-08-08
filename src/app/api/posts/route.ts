import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPosts, createPost, awardPoints, type PostMedia } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";
import { FOOD_TAGS } from "@/data/foodTags";
import { AMENITY_LABELS, ROOM_LABELS } from "@/data/reviewScales";

const MAX_MEDIA = 4;
const MAX_MEDIA_LENGTH = 4_000_000;
const MAX_CAPTION = 2_000;

export async function GET() {
  const posts = await getPosts();
  return NextResponse.json({ posts: posts.slice().reverse() });
}

/** Keeps a client from writing arbitrary shapes into the media jsonb column. */
function parseMedia(raw: unknown): PostMedia[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "Media must be a list." };
  if (raw.length > MAX_MEDIA) return { error: `Up to ${MAX_MEDIA} photos per post.` };

  const media: PostMedia[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid media item." };
    const { url, type, alt } = item as Record<string, unknown>;
    if (typeof url !== "string" || !url) return { error: "Invalid media item." };
    if (url.length > MAX_MEDIA_LENGTH) return { error: "That image is too large." };
    if (type !== "image" && type !== "video") return { error: "Invalid media type." };
    media.push({ url, type, alt: typeof alt === "string" ? alt.slice(0, 300) : undefined });
  }
  return media;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to post to the feed." }, { status: 401 });
  }

  const body = await req.json();
  const { text, restaurant, dishName, price, rating, locationLabel } = body;

  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write something to post." }, { status: 400 });
  }

  const media = parseMedia(body.media);
  if ("error" in media) {
    return NextResponse.json({ error: media.error }, { status: 400 });
  }

  // Unknown values are dropped rather than rejected — the client picks from a
  // fixed list, so anything else is noise, not a user-correctable mistake.
  const pickFrom = (raw: unknown, allowed: readonly string[]) =>
    Array.isArray(raw)
      ? (raw as unknown[])
          .filter((t): t is string => typeof t === "string")
          .filter((t) => allowed.includes(t))
          .slice(0, allowed.length)
      : [];

  const tags = pickFrom(body.tags, FOOD_TAGS as readonly string[]);
  const amenities = pickFrom(body.amenities, AMENITY_LABELS);
  const vibe =
    typeof body.vibe === "string" && ROOM_LABELS.includes(body.vibe) ? body.vibe : undefined;

  let parsedRating: number | undefined;
  if (rating !== undefined && rating !== null && rating !== "") {
    const n = Number(rating);
    if (Number.isNaN(n) || n < 0 || n > 10) {
      return NextResponse.json({ error: "Rating must be between 0 and 10." }, { status: 400 });
    }
    parsedRating = Math.round(n * 10) / 10;
  }

  const post = await createPost({
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl,
    authorPoints: user.points + POINT_RULES.createPost,
    text: String(text).trim().slice(0, MAX_CAPTION),
    restaurant: restaurant ? String(restaurant).trim() : undefined,
    dishName: dishName ? String(dishName).trim().slice(0, 120) : undefined,
    price: price ? String(price).trim().slice(0, 20) : undefined,
    rating: parsedRating,
    locationLabel: locationLabel ? String(locationLabel).trim().slice(0, 120) : undefined,
    tags,
    amenities,
    vibe,
    media,
  });

  const freshUser = await awardPoints(user.id, POINT_RULES.createPost, `post:${post.id}`);

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points + POINT_RULES.createPost,
    pointsEarned: POINT_RULES.createPost,
  });
}
