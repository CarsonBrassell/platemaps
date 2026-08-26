import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  getPosts,
  getProfilePosts,
  createPost,
  awardPoints,
  type PostMedia,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { POINT_RULES } from "@/lib/points";
import { BEST_AT_LABELS } from "@/data/reviewScales";
import { MAX_POST_TEXT } from "@/lib/postLimits";
import { isStoredPhotoUrl } from "@/lib/photos";
import { resolvePostRefs } from "@/lib/discover";

const MAX_MEDIA = 4;
/* A blob URL and nothing like a payload. Media used to arrive as base64 data
   URLs capped at four million characters each, which let one post carry ~16MB
   of body — over the request limit, and every byte of it landing in a Postgres
   column the feed then had to read back on every query. */
const MAX_MEDIA_URL_LENGTH = 512;

/**
 * Every post, newest first. Backs the Saved view, which needs posts regardless
 * of which feed surfaced them.
 *
 * `places` is the same per-restaurant map the two feed routes send, so the
 * filter rail works on Saved too — see `resolvePostRefs` in lib/discover.ts.
 */
/**
 * `?mine=1` narrows the response to the signed-in person's own plates plus
 * the ones they saved — what a profile screen renders, and nothing else.
 *
 * It is a flag rather than `?userId=`, deliberately: the id comes off the
 * session, so there is no parameter anyone can point at somebody else to read
 * their saved list. An unauthenticated `?mine=1` falls through to the normal
 * response instead of erroring, because the feed is public and a logged-out
 * profile has nothing to narrow to.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const mine = request.nextUrl.searchParams.get("mine") === "1";
  const rows =
    mine && user
      ? await getProfilePosts(user.id, user.id)
      : await getPosts(user?.id ?? null);
  const { posts, places } = await resolvePostRefs(rows.slice().reverse());
  return NextResponse.json({ posts, places });
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
    if (url.length > MAX_MEDIA_URL_LENGTH || !isStoredPhotoUrl(url)) {
      return { error: "Photos have to be uploaded before the post is published." };
    }
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
     client picks from a fixed chip list.
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
    // Publishing pays nothing (POINT_RULES.createPost is 0), so the author's
    // total is unchanged by the act of posting — see the note in lib/points.ts.
    authorPoints: user.points,
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
    vibe,
    media,
    // Snapshot of the author's CURRENT toggle, frozen onto the row — not read
    // live later. See the photosPublic note on createPost in lib/db.ts.
    photosPublic: user.sharePhotosPublicly,
    bestAspect,
    worstAspect,
  });

  /* The call stays, and it is not dead code. `POINT_RULES.createPost` is 0
     today, and `awardPoints` returns early on a zero amount — no ledger row, no
     total moved — so publishing pays nothing on purpose (lib/points.ts). Left
     wired rather than deleted because "post:<id>" is unique by construction and
     this is the only place that could ever pay it: putting the number back to a
     non-zero value is then a one-line change in points.ts, which is what that
     file promises. */
  const { user: freshUser } = await awardPoints(
    user.id,
    POINT_RULES.createPost,
    `post:${post.id}`,
  );

  return NextResponse.json({
    post,
    points: freshUser?.points ?? user.points,
    pointsEarned: POINT_RULES.createPost,
  });
}
