import { NextResponse } from "next/server";
import { deleteComment, getCommentContext, getPostById } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/adminGate";
import { invalidateRestaurantPage } from "@/lib/restaurantPage";

/**
 * Deletes a comment and its replies. Admin only (lib/adminGate.ts): there is
 * no self-serve comment delete in the product, so this route answers 403 to
 * everyone whose session id is not on that list, whatever the client claims.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to delete comments." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "comment-delete:user",
    key: user.id,
    max: 120,
    windowMinutes: 60,
  });
  if (limited) return limited;

  if (!isAdminUser(user.id)) {
    return NextResponse.json({ error: "You can't delete this comment." }, { status: 403 });
  }

  const { id } = await params;
  const context = await getCommentContext(id);
  if (!context) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  await deleteComment(id);
  const post = await getPostById(context.postId);
  if (post?.restaurantId) invalidateRestaurantPage(post.restaurantId);
  return NextResponse.json({ ok: true });
}
