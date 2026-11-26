import { NextResponse } from "next/server";
import { getPostById, getPostUpvoters } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cachedJson } from "@/lib/httpCache";

/**
 * Who upvoted a plate. Public, like the count beside the arrows: signed out
 * gets the list too. Resolving the post through getPostById first means a
 * plate hidden from this viewer by a block 404s here exactly as it does at
 * /api/posts/[id], so the id confirms nothing. Downvoters are never listed.
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
  const upvoters = await getPostUpvoters(id, user?.id ?? null);
  // Friend flags depend on who is asking, so never a shared cache.
  return cachedJson(req, { upvoters }, { scope: "private" });
}
