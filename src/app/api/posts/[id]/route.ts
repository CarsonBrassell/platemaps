import { NextResponse } from "next/server";
import { getPostById, deletePost } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cachedJson } from "@/lib/httpCache";
import { invalidateRestaurantPage } from "@/lib/restaurantPage";

/**
 * A single post by id, for the case a deep link (a share, or a bubble on the
 * map) points at a post that's fallen out of Discover's top-N ranked slice.
 * Not itself a discovery surface — nothing lists posts through this route,
 * it only resolves one already-known id.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const post = await getPostById(id, user?.id ?? null);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  // Whether the viewer voted rides on the row, so never shared; the ETag
  // still saves the body when nothing changed.
  return cachedJson(req, { post }, { scope: "private" });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to delete posts." }, { status: 401 });
  }

  const { id } = await params;
  const post = await getPostById(id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  if (post.userId !== user.id) {
    return NextResponse.json(
      { error: "You can only delete your own posts." },
      { status: 403 }
    );
  }

  await deletePost(id);
  // The restaurant page it counted toward is cached (lib/restaurantPage.ts).
  invalidateRestaurantPage(post.restaurantId);
  return NextResponse.json({ ok: true });
}
