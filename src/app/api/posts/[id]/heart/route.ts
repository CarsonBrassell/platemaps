import { NextResponse } from "next/server";
import { getPostById, toggleHeart, getHeartsForAuthor } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Friends' reaction. The response is deliberately shaped differently from
 * upvote's: no count, anywhere, ever — that's the whole point of hearts. If a
 * future change to this route adds one, it has broken the feature.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to react to posts." }, { status: 401 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const { hearted } = await toggleHeart(id, user.id);
  return NextResponse.json({ hearted });
}

/**
 * "Who hearted this" — the author's own view of their post's hearts. Every
 * other requester gets 403; the access check itself lives in
 * getHeartsForAuthor (it throws), not just here, so there is exactly one
 * place in the codebase this can go wrong.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const heartedBy = await getHeartsForAuthor(id, user.id);
    return NextResponse.json({ heartedBy });
  } catch {
    return NextResponse.json(
      { error: "Only a post's author can see who hearted it." },
      { status: 403 }
    );
  }
}
