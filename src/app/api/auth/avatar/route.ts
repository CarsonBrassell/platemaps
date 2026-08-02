import { NextResponse } from "next/server";
import { updateUserAvatar } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const MAX_AVATAR_LENGTH = 2_000_000;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to update your photo." }, { status: 401 });
  }

  const { avatarUrl } = await req.json();
  if (!avatarUrl || typeof avatarUrl !== "string") {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  if (avatarUrl.length > MAX_AVATAR_LENGTH) {
    return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  }

  const freshUser = await updateUserAvatar(user.id, avatarUrl);
  if (!freshUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: freshUser.id,
    name: freshUser.name,
    email: freshUser.email,
    points: freshUser.points,
    avatarUrl: freshUser.avatarUrl,
  });
}
