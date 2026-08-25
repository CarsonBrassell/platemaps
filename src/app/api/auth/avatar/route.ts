import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { updateUserAvatar } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isStoredPhotoUrl } from "@/lib/photos";

/* An address, not a picture. Avatars used to arrive as base64 data URLs
   capped at two million characters and were stored that way, so every query
   that read a user read their whole photo with them. */
const MAX_AVATAR_URL_LENGTH = 512;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to update your photo." }, { status: 401 });
  }

  const { avatarUrl } = await req.json();
  if (!avatarUrl || typeof avatarUrl !== "string") {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  if (avatarUrl.length > MAX_AVATAR_URL_LENGTH || !isStoredPhotoUrl(avatarUrl)) {
    return NextResponse.json(
      { error: "Photos have to be uploaded before they're saved." },
      { status: 400 },
    );
  }

  const freshUser = await updateUserAvatar(user.id, avatarUrl);
  if (!freshUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json(accountJson(freshUser));
}
