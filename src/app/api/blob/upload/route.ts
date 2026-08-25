import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/session";
import { MAX_UPLOAD_BYTES, isStoredPhotoUrl } from "@/lib/photos";

/**
 * The one door photos go through on their way to the blob store.
 *
 * The bytes pass through this function rather than going straight from the
 * browser to the store, which costs a hop but buys the two things that hop is
 * for: the store's write token never reaches a client, and nothing lands in
 * the bucket that wasn't signed in and checked first. A 1080px capture is
 * ~150KB, so the hop is cheap and stays well inside the request body limit —
 * if photos ever get big enough for that to stop being true, this is the
 * place that becomes a client-side upload with a scoped token.
 *
 * The pathname carries the owner and a UUID. The UUID is what makes the URL
 * unguessable, which matters because the store is public: an address handed
 * out is an address that works, so `photos_public` decides who is *told* a
 * URL, never who could fetch one they already have. See the note on
 * `photosPublic` in lib/db.ts.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to add a photo." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  // Both writers encode JPEG and nothing else does; anything else is either a
  // bug or a forged request, and neither should be able to fill the bucket.
  if (file.type !== "image/jpeg") {
    return NextResponse.json({ error: "Photos have to be JPEG." }, { status: 415 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  }

  const folder = form?.get("kind") === "avatar" ? "avatars" : "posts";

  try {
    const { url } = await put(`${folder}/${user.id}/${randomUUID()}.jpg`, file, {
      access: "public",
      contentType: "image/jpeg",
    });
    return NextResponse.json({ url });
  } catch {
    /* The composer still holds the JPEG either way — a draft is the blob in
       memory, not a thing in the store — so a failure here costs the press of
       Post, not the post. */
    return NextResponse.json({ error: "Couldn't save that photo. Try again." }, { status: 502 });
  }
}

/**
 * Takes a photo back out of the store.
 *
 * `uploadPhotos` calls this to roll back a partly-uploaded post: if the third
 * of four photos fails, the two that landed belong to a post that will never
 * exist, and they have to go before the error reaches anyone.
 *
 * The ownership check is the pathname, not a database read. Every upload is
 * written to `<folder>/<userId>/<uuid>.jpg` by the POST above, so a URL whose
 * path does not carry the caller's own id is not theirs to delete — and
 * nothing else can put a file in that shape. Without it this is an endpoint
 * for deleting any photo on the app whose URL you happen to know.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { url } = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof url !== "string" || !isStoredPhotoUrl(url)) {
    return NextResponse.json({ error: "Not a stored photo." }, { status: 400 });
  }
  if (!new URL(url).pathname.includes(`/${user.id}/`)) {
    return NextResponse.json({ error: "That isn't your photo." }, { status: 403 });
  }

  try {
    await del(url);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't remove that photo." }, { status: 502 });
  }
}
