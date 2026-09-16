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

  const user = await getCurrentUser();
  const [leaderboard, you] = await Promise.all([
    getLeaderboard(window, 10),
    user ? getUserRank(user.id, window) : Promise.resolve(null),
  ]);

  // `you` is the viewer's own rank, so private; the ETag still spares the
  // body when the board has not moved.
  return cachedJson(req, { window, leaderboard, you }, { scope: "private" });
}
