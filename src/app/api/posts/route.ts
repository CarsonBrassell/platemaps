import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getPosts, createPost, awardPoints, type PostMedia } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";
import { FOOD_TAGS } from "@/data/foodTags";
import { AMENITY_LABELS, ROOM_LABELS, BEST_AT_LABELS } from "@/data/reviewScales";
import { MAX_POST_TEXT } from "@/lib/postLimits";
/* Read rather than restated. photos.ts says the capture settings are "still
   the answer to what will the post API accept, and the day another way in
   exists it should read them rather than pick its own" — this route was that
   other way in, and it had picked its own: a duplicate `MAX_MEDIA = 4` and a
   ceiling four million characters wide. Both live in one place now. */
import { MAX_PHOTOS, MAX_MEDIA_LENGTH } from "@/lib/photos";

export async function GET() {
  const user = await getCurrentUser();
  const posts = await getPosts(user?.id ?? null);
  return NextResponse.json({ posts: posts.slice().reverse() });
}

/** Keeps a client from writing arbitrary shapes into the media jsonb column. */
function parseMedia(raw: unknown): PostMedia[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "Media must be a list." };
  if (raw.length > MAX_PHOTOS) return { error: `Up to ${MAX_PHOTOS} photos per post.` };

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
  const { text, restaurant, restaurantId, dishName, price, rating, locationLabel } = body;

  let restaurantLat: number | undefined;
  let restaurantLng: number | undefined;
  if (body.restaurantLat !== undefined && body.restaurantLat !== null) {
    const n = Number(body.restaurantLat);
    if (!Number.isNaN(n)) restaurantLat = n;
  }
  if (body.restaurantLng !== undefined && body.restaurantLng !== null) {
    const n = Number(body.restaurantLng);
    if (!Number.isNaN(n)) restaurantLng = n;
  }

  if (!text || !String(text).trim()) {
    return NextResponse.json({ error: "Write something to post." }, { status: 400 });
  }
  /* Rejected, not truncated. Both composers cap the textarea at the same
     number, so reaching this branch means something bypassed them — and
     quietly deleting the end of someone's sentence is a worse answer than
     saying it didn't fit. See lib/postLimits.ts. */
  if (String(text).trim().length > MAX_POST_TEXT) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_POST_TEXT} characters.` },
      { status: 400 },
    );
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

  /* There is one rating scale: a 0-100 percent about one plate. `ratingKind` is
     still written so the column stays self-describing — rows from before the
     1-5 star restaurant review was retired carry `restaurant`, and the feed
     reads the tag to render those back as the stars they were entered as. New
     rows are always `dish`.

     A client asking to write `restaurant` is refused rather than quietly
     rewritten: a 1-5 number stored as a percent would read as a 4% plate, and
     silently coercing it would put that in the average every restaurant score
     is now derived from. */
  let parsedRating: number | undefined;
  let parsedRatingKind: "dish" | undefined;
  if (rating !== undefined && rating !== null && rating !== "") {
    if (body.ratingKind !== undefined && body.ratingKind !== "dish") {
      return NextResponse.json(
        { error: "Ratings are a percentage on a plate. There is no restaurant rating to write." },
        { status: 400 },
      );
    }
    parsedRatingKind = "dish";
    const n = Number(rating);
    if (Number.isNaN(n)) {
      return NextResponse.json({ error: "Rating must be a number." }, { status: 400 });
    }
    if (n < 0 || n > 100) {
      return NextResponse.json({ error: "A rating is 0 to 100%." }, { status: 400 });
    }
    parsedRating = Math.round(n);
  }

  /* Aspect verdicts. Unknown labels are dropped rather than rejected — the
     client picks from a fixed chip list, same as tags and amenities above.
     The same aspect can't be both the best and the worst thing; if a client
     sends that, the fault is what gets dropped, since the praise came from
     the required chip and the letdown from the optional one. */
  const pickAspect = (raw: unknown) =>
    typeof raw === "string" && BEST_AT_LABELS.includes(raw) ? raw : undefined;

  const bestAspect = pickAspect(body.bestAspect);
  const rawWorst = pickAspect(body.worstAspect);
  const worstAspect = rawWorst && rawWorst !== bestAspect ? rawWorst : undefined;

  const post = await createPost({
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl,
    authorPoints: user.points + POINT_RULES.createPost,
    text: String(text).trim(),
    restaurant: restaurant ? String(restaurant).trim() : undefined,
    restaurantId: restaurantId ? String(restaurantId).trim() : undefined,
    restaurantLat,
    restaurantLng,
    dishName: dishName ? String(dishName).trim().slice(0, 120) : undefined,
    price: price ? String(price).trim().slice(0, 20) : undefined,
    rating: parsedRating,
    ratingKind: parsedRatingKind,
    locationLabel: locationLabel ? String(locationLabel).trim().slice(0, 120) : undefined,
    tags,
    amenities,
    vibe,
    media,
    // Snapshot of the author's CURRENT toggle, frozen onto the row — not read
    // live later. See the photosPublic note on createPost in lib/db.ts.
    photosPublic: user.sharePhotosPublicly,
    bestAspect,
    worstAspect,
  });

  // "post:<id>" is unique by construction — a post is only created once — so
  // this one always pays and has no `awarded` to consult.
  const { user: freshUser } = await awardPoints(
    user.id,
    POINT_RULES.createPost,
    `post:${post.id}`,
  );

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points + POINT_RULES.createPost,
    pointsEarned: POINT_RULES.createPost,
  });
}
