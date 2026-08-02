import { NextResponse } from "next/server";
import { getPostById, deletePost } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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
  return NextResponse.json({ ok: true });
}
