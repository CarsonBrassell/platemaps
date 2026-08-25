import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/session";
import { MAX_UPLOAD_BYTES } from "@/lib/photos";

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
    /* The composer holds the photo either way — a failed upload marks the
       draft rather than losing it, so the retry is taking it again, not
       starting the post over. */
    return NextResponse.json({ error: "Couldn't save that photo. Try again." }, { status: 502 });
  }
}
