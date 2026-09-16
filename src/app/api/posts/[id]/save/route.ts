import { NextResponse } from "next/server";
import { getPostById, toggleSave } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to save posts." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "save:user",
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

  const saved = await toggleSave(id, user.id);
  return NextResponse.json({ saved });
}
