import { NextResponse } from "next/server";
import { getPosts, savePosts } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to save posts." }, { status: 401 });
  }

  const { id } = await params;
  const posts = getPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const alreadySaved = post.savedBy.includes(user.id);
  post.savedBy = alreadySaved
    ? post.savedBy.filter((uid) => uid !== user.id)
    : [...post.savedBy, user.id];
  savePosts(posts);

  return NextResponse.json({ saved: !alreadySaved });
}
