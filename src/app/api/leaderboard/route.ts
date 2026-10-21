import type { NextRequest } from "next/server";
import { cachedJson } from "@/lib/httpCache";
import { getLeaderboard, getUserRank, type LeaderboardWindow } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const WINDOWS: LeaderboardWindow[] = ["today", "week", "month", "all"];

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("window");
  const window: LeaderboardWindow = WINDOWS.includes(raw as LeaderboardWindow)
    ? (raw as LeaderboardWindow)
    : "week";

  // Ten by default, which is what every board drew before this was a
  // parameter. The free-food board asks for a couple more so the people just
  // under the cut are visible; 25 caps what any caller can make one request
  // pull.
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 25) : 10;

  const user = await getCurrentUser();
  const [leaderboard, you] = await Promise.all([
    getLeaderboard(window, limit),
    user ? getUserRank(user.id, window) : Promise.resolve(null),
  ]);

  // `you` is the viewer's own rank, so private; the ETag still spares the
  // body when the board has not moved.
  return cachedJson(req, { window, leaderboard, you }, { scope: "private" });
}
