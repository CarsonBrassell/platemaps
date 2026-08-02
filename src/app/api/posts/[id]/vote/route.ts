import { NextRequest, NextResponse } from "next/server";
import { getPosts, savePosts, getUsers, saveUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const VOTE_POINTS = 2;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote on posts." }, { status: 401 });
  }

  const { direction } = await req.json();
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "Invalid vote direction." }, { status: 400 });
  }

  const { id } = await params;
  const posts = getPosts();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const wasUp = post.upvotedBy.includes(user.id);
  const wasDown = post.downvotedBy.includes(user.id);
  post.upvotedBy = post.upvotedBy.filter((uid) => uid !== user.id);
  post.downvotedBy = post.downvotedBy.filter((uid) => uid !== user.id);

  let myVote: "up" | "down" | null = null;
  if (direction === "up" && !wasUp) {
    post.upvotedBy.push(user.id);
    myVote = "up";
  } else if (direction === "down" && !wasDown) {
    post.downvotedBy.push(user.id);
    myVote = "down";
  }

  let pointsEarned = 0;
  if (myVote && !post.votePointsAwardedTo.includes(user.id)) {
    post.votePointsAwardedTo.push(user.id);
    pointsEarned = VOTE_POINTS;
  }
  savePosts(posts);

  let points = user.points;
  if (pointsEarned > 0) {
    const users = getUsers();
    const freshUser = users.find((u) => u.id === user.id);
    if (freshUser) {
      freshUser.points += pointsEarned;
      saveUsers(users);
      points = freshUser.points;
    }
  }

  return NextResponse.json({
    myVote,
    score: post.upvotedBy.length - post.downvotedBy.length,
    pointsEarned,
    points,
  });
}
