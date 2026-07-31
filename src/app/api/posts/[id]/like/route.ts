import { NextResponse } from "next/server";
import { getPosts, savePosts, getUsers, saveUsers, addPoints } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const LIKE_POINTS = 2;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to like posts." }, { status: 401 });
  }

  const { id } = await params;
  const posts = getPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const alreadyLiked = post.likedBy.includes(user.id);
  let pointsEarned = 0;

  if (alreadyLiked) {
    post.likedBy = post.likedBy.filter((uid) => uid !== user.id);
  } else {
    post.likedBy.push(user.id);
    if (!post.likePointsAwardedTo.includes(user.id)) {
      post.likePointsAwardedTo.push(user.id);
      pointsEarned = LIKE_POINTS;
    }
  }
  savePosts(posts);

  let points = user.points;
  if (pointsEarned > 0) {
    const users = getUsers();
    const freshUser = users.find((u) => u.id === user.id);
    if (freshUser) {
      addPoints(freshUser, pointsEarned);
      saveUsers(users);
      points = freshUser.points;
    }
  }

  return NextResponse.json({
    liked: !alreadyLiked,
    likeCount: post.likedBy.length,
    pointsEarned,
    points,
  });
}
