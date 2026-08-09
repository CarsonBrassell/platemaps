import { NextResponse } from "next/server";
import { getDiscoverFeed } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * The public feed — everyone, unfiltered by friendship, ranked by recency
 * with upvotes as a secondary factor. See getDiscoverFeed in lib/db.ts for
 * the ranking query and the photo-privacy stripping; this route is a thin
 * pass-through so that logic exists in exactly one place.
 */
export async function GET() {
  const user = await getCurrentUser();
  const posts = await getDiscoverFeed(user?.id ?? null);
  return NextResponse.json({ posts });
}
