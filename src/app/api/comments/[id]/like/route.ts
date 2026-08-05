import { NextResponse } from "next/server";
import { toggleCommentLike } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to like comments." }, { status: 401 });
  }

  const { id } = await params;
  return NextResponse.json(await toggleCommentLike(id, user.id));
}
