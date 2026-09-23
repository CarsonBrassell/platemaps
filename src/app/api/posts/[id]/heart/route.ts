import { NextResponse } from "next/server";
import { getPostById, toggleHeart, getHeartsForAuthor, getBlockStatus } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";
import { notifyHeart } from "@/lib/notify";

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

  const limited = await limitOrReject({
    scope: "heart:user",
    key: user.id,
    max: 120,
    windowMinutes: 15,
  });
  if (limited) return limited;

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  /* Same guard posts/[id]/comments uses: a block is meant to sever contact,
     and hearting is what would otherwise put the blocked party's name at the
     top of the blocker's activity feed. Read as "not found" like the missing
     post above, so the id confirms nothing. */
  if ((await getBlockStatus(user.id, post.userId)) !== "none") {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const { hearted } = await toggleHeart(id, user.id);
  if (hearted) notifyHeart(post, user);
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
