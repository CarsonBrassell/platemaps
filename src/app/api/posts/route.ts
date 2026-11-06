import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  countPaidPostsToday,
  getProfilePosts,
  getRestaurantById,
  getRestaurantPosts,
  createPost,
  awardPoints,
  type PostMedia,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { clientIp } from "@/lib/loginThrottle";
import { invalidateRestaurantPage } from "@/lib/restaurantPage";
import { MAX_PAID_POSTS_PER_DAY, POINT_RULES } from "@/lib/points";
import { BEST_AT_LABELS } from "@/data/reviewScales";
import { MAX_POST_TEXT } from "@/lib/postLimits";
import { storedPhotoOwner } from "@/lib/photos";
import { resolvePostRefs } from "@/lib/discover";
import { BLOCKED_MESSAGE, moderateText } from "@/lib/moderation";
import { limitOrReject } from "@/lib/rateLimit";

const MAX_MEDIA = 4;
/* A blob URL and nothing like a payload. Media used to arrive as base64 data
   URLs capped at four million characters each, which let one post carry ~16MB
   of body — over the request limit, and every byte of it landing in a Postgres
   column the feed then had to read back on every query. */
const MAX_MEDIA_URL_LENGTH = 512;

/**
 * Two bounded reads, and deliberately no "everything": a bare `GET /api/posts`
 * used to return the whole table to any signed-out caller, and the feeds are
 * the only ways to browse.
 *
 * - `?mine=1` is the signed-in person's own plates plus the ones they saved,
 *   which backs the profile and the Saved view. It is a flag rather than
 *   `?userId=` on purpose: the id comes off the session, so there is no
 *   parameter anyone can point at somebody else's saved list.
 * - `?restaurant=<id>` is one restaurant's thread.
 *
 * Anything else, including `?mine=1` signed out, is an empty list. `places` is
 * the same per-restaurant map the two feed routes send, so the filter rail
 * works on Saved too — see `resolvePostRefs` in lib/discover.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const params = request.nextUrl.searchParams;
  const restaurantId = params.get("restaurant")?.slice(0, 200);

  let rows: Awaited<ReturnType<typeof getProfilePosts>> = [];
  if (restaurantId) {
    const limited = await limitOrReject({
      scope: "posts-thread:ip",
      key: clientIp(request),
      max: 300,
      windowMinutes: 10,
    });
    if (limited) return limited;

    const restaurant = await getRestaurantById(restaurantId);
    if (restaurant) {
      rows = await getRestaurantPosts(restaurant.id, restaurant.name, user?.id ?? null);
    }
  } else if (params.get("mine") === "1" && user) {
    rows = await getProfilePosts(user.id, user.id);
  }

  const { posts, places } = await resolvePostRefs(rows.slice().reverse());
  return NextResponse.json({ posts, places });
}

/**
 * Keeps a client from writing arbitrary shapes into the media jsonb column.
 * Each photo has to be the author's own upload: a post is what publishes a
 * photo, so someone else's address here would reshare a friends-only picture,
 * and deleting this post would try to delete a file that isn't theirs.
 */
function parseMedia(raw: unknown, ownerId: string): PostMedia[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "Media must be a list." };
  if (raw.length > MAX_MEDIA) return { error: `Up to ${MAX_MEDIA} photos per post.` };

  const media: PostMedia[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid media item." };
    const { url, type, alt } = item as Record<string, unknown>;
    if (typeof url !== "string" || !url) return { error: "Invalid media item." };
    if (url.length > MAX_MEDIA_URL_LENGTH || storedPhotoOwner(url) !== ownerId) {
      return { error: "Photos have to be uploaded before the post is published." };
    }
    if (type !== "image" && type !== "video") return { error: "Invalid media type." };
    media.push({ url, type, alt: typeof alt === "string" ? alt.slice(0, 300) : undefined });
  }
  return media;
}

/** Plates in a meal beyond the first. Six frames is where a collage stops
    being readable at card width (see MealCollage), so five extra courses. */
const MAX_COURSES = 5;

type ParsedCourse = { dishName?: string; price?: string; rating: number; media: PostMedia[] };

/** The extra plates of a meal, held to the same rules as the hero. */
function parseCourses(raw: unknown, ownerId: string): ParsedCourse[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "Courses must be a list." };
  if (raw.length > MAX_COURSES) {
    return { error: `A meal is up to ${MAX_COURSES + 1} plates.` };
  }
  const courses: ParsedCourse[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid course." };
    const { dishName, price, rating } = item as Record<string, unknown>;
    if (rating === undefined || rating === null || rating === "") {
      return { error: "Every plate in a meal gets a percent." };
    }
    const n = Number(rating);
    if (Number.isNaN(n) || n < 0 || n > 100) {
      return { error: "A rating is 0 to 100%." };
    }
    const name = dishName ? String(dishName).trim().slice(0, 120) : "";
    if (!name) return { error: "Every plate in a meal names its dish." };
    if (moderateText(name).action === "block") return { error: BLOCKED_MESSAGE };
    const media = parseMedia((item as Record<string, unknown>).media, ownerId);
    if ("error" in media) return media;
    courses.push({
      dishName: name,
      price: price ? String(price).trim().slice(0, 20) : undefined,
      rating: Math.round(n),
      media,
    });
  }
  return courses;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to post to the feed." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "posts:user",
    key: user.id,
    max: 20,
    windowMinutes: 60,
  });
  if (limited) return limited;

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== "object") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  // Postgres text cannot hold a NUL, so one would just be a 500 at the write.
  const clean = (value: unknown) =>
    typeof value === "string" ? value.replaceAll("\0", "") : value;
  const body = parsedBody as Record<string, unknown>;
  const { rating } = body;
  const text = clean(body.text);
  const restaurant = clean(body.restaurant);
  const restaurantId = clean(body.restaurantId);
  const dishName = clean(body.dishName);
  const price = clean(body.price);
  const locationLabel = clean(body.locationLabel);

  let restaurantLat: number | undefined;
  let restaurantLng: number | undefined;
  // Finite and on the planet: "Infinity" is a number to Number(), and one row
  // holding it breaks every distance sum the Nearby filter runs over the feed.
  if (body.restaurantLat !== undefined && body.restaurantLat !== null) {
    const n = Number(body.restaurantLat);
    if (Number.isFinite(n) && Math.abs(n) <= 90) restaurantLat = n;
  }
  if (body.restaurantLng !== undefined && body.restaurantLng !== null) {
    const n = Number(body.restaurantLng);
    if (Number.isFinite(n) && Math.abs(n) <= 180) restaurantLng = n;
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

  /* Slurs are refused; ordinary profanity is allowed through and reported as
     flagged. The check covers the caption *and* the dish name, because a
     custom dish is free text the composer lets someone type — filtering only
     the caption would leave the obvious hole open. See lib/moderation.ts. */
  /* dishName has no length check of its own before this point (only text
     does, above) — cap it here to the same 120 enforced at the write below,
     so an oversized dishName can't reach the moderation regexes. See F30. */
  /* The other free-text fields print on the card too, so they go through the
     same filter, each capped to what the write below stores. */
  const moderated = moderateText(
    [
      String(text),
      dishName ? String(dishName).slice(0, 120) : "",
      restaurant ? String(restaurant).slice(0, 200) : "",
      price ? String(price).slice(0, 20) : "",
      locationLabel ? String(locationLabel).slice(0, 120) : "",
    ].join(" "),
  );
  if (moderated.action === "block") {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 422 });
  }

  const media = parseMedia(body.media, user.id);
  if ("error" in media) {
    return NextResponse.json({ error: media.error }, { status: 400 });
  }

  /* `tags` and `amenities` are no longer read off the body at all.

     Neither was ever written by a composer — no tag picker and no amenity
     picker has ever existed — so accepting them meant this route validating a
     vocabulary only a script could send. Refusing them here is what makes "a
     chip on a card is something a person chose" true at the write, instead of
     something the render has to keep filtering for.

     `vibe` narrows to BEST_AT_LABELS for the same reason: it used to accept
     ROOM_LABELS, which folded the deleted atmosphere words in beside the
     best-at pick. See data/reviewScales.ts. */
  const vibe =
    typeof body.vibe === "string" && BEST_AT_LABELS.includes(body.vibe)
      ? body.vibe
      : undefined;

  /* There is one rating scale: a 0-100 percent about one plate. `ratingKind` is
     still written so the column stays self-describing — rows from before the
     1-5 star restaurant review was retired carry `restaurant`, and the feed
     reads the tag to render those back as the stars they were entered as. New
     rows are always `dish`.

     A client asking to write `restaurant` is refused rather than quietly
     rewritten: a 1-5 number stored as a percent would read as a 4% plate, and
     silently coercing it would put that in the average every restaurant score
     is now derived from. */
  /* And every new post carries one. The unrated post — "just leave a comment"
     — is retired: both composers now walk one path that ends at the meter, and
     a write with no rating is refused here rather than stored as a row no
     plate score, no aspect tally and no dish sheet number can ever read.

     This is a rule about *new* rows only. Unrated rows written before the fork
     came out still exist and still render; nothing about this route rewrites
     or hides them. */
  if (rating === undefined || rating === null || rating === "") {
    return NextResponse.json(
      { error: "Every post rates a plate. Give it a percent." },
      { status: 400 },
    );
  }
  if (body.ratingKind !== undefined && body.ratingKind !== "dish") {
    return NextResponse.json(
      { error: "Ratings are a percentage on a plate. There is no restaurant rating to write." },
      { status: 400 },
    );
  }
  const parsedRatingKind = "dish" as const;
  const ratingNumber = Number(rating);
  if (Number.isNaN(ratingNumber)) {
    return NextResponse.json({ error: "Rating must be a number." }, { status: 400 });
  }
  if (ratingNumber < 0 || ratingNumber > 100) {
    return NextResponse.json({ error: "A rating is 0 to 100%." }, { status: 400 });
  }
  const parsedRating = Math.round(ratingNumber);

  /* Aspect verdicts. Unknown labels are dropped rather than rejected — the
     client picks from a fixed chip list.
     The same aspect can't be both the best and the worst thing; if a client
     sends that, the fault is what gets dropped, since the praise came from
     the required chip and the letdown from the optional one. */
  const pickAspect = (raw: unknown) =>
    typeof raw === "string" && BEST_AT_LABELS.includes(raw) ? raw : undefined;

  const bestAspect = pickAspect(body.bestAspect);
  const rawWorst = pickAspect(body.worstAspect);
  const worstAspect = rawWorst && rawWorst !== bestAspect ? rawWorst : undefined;

  /* A meal: the rest of the plates, each held to the same rules as the first
     — a rating in range, a dish name capped and moderated, photos from our
     own blob store. Optional and empty for the ordinary single-plate post.
     Capped at MAX_COURSES beyond the hero so the collage stays a collage and
     one write cannot fan out into an unbounded number of rows. */
  const courses = parseCourses(body.courses, user.id);
  if ("error" in courses) {
    return NextResponse.json({ error: courses.error }, { status: 400 });
  }

  /* An id has to name a real restaurant, and that restaurant's own name and
     position win over whatever came with it. A post with no id is still
     allowed: older composers and free-typed places send only the name. */
  const claimedRestaurantId = restaurantId ? String(restaurantId).trim().slice(0, 200) : undefined;
  const place = claimedRestaurantId ? await getRestaurantById(claimedRestaurantId) : null;
  if (claimedRestaurantId && !place) {
    return NextResponse.json({ error: "That restaurant isn't on PlateMaps." }, { status: 400 });
  }

  const paysPoints = (await countPaidPostsToday(user.id)) < MAX_PAID_POSTS_PER_DAY;
  const pointsEarned = paysPoints ? POINT_RULES.createPost : 0;

  const post = await createPost({
    id: randomUUID(),
    userId: user.id,
    authorName: user.name,
    authorAvatarUrl: user.avatarUrl,
    // The row's snapshot of the author's total, as it stands once the publish
    // award below has landed — otherwise a fresh plate would show its author
    // a few points behind their own chip. Amount lives in lib/points.ts.
    authorPoints: user.points + pointsEarned,
    text: String(text).trim(),
    restaurant: place?.name ?? (restaurant ? String(restaurant).trim().slice(0, 200) : undefined),
    restaurantId: claimedRestaurantId,
    restaurantLat: place?.lat ?? restaurantLat,
    restaurantLng: place?.lng ?? restaurantLng,
    dishName: dishName ? String(dishName).trim().slice(0, 120) : undefined,
    price: price ? String(price).trim().slice(0, 20) : undefined,
    rating: parsedRating,
    ratingKind: parsedRatingKind,
    locationLabel: locationLabel ? String(locationLabel).trim().slice(0, 120) : undefined,
    vibe,
    media,
    // Snapshot of the author's CURRENT toggle, frozen onto the row — not read
    // live later. See the photosPublic note on createPost in lib/db.ts.
    photosPublic: user.sharePhotosPublicly,
    bestAspect,
    worstAspect,
    courses: courses.length > 0 ? courses : undefined,
  });
  // The restaurant's page is served from cache until told otherwise
  // (lib/restaurantPage.ts); a new plate is exactly what changes it.
  invalidateRestaurantPage(claimedRestaurantId ?? null);

  /* The publish award. "post:<id>" is unique by construction, so a retried
     create cannot pay it twice; the amount itself lives in lib/points.ts. */
  const { user: freshUser } = paysPoints
    ? await awardPoints(user.id, POINT_RULES.createPost, `post:${post.id}`)
    : { user: null };

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points,
    pointsEarned,
  });
}
