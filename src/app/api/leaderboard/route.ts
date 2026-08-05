import { NextRequest, NextResponse } from "next/server";
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

  return NextResponse.json({ window, leaderboard, you });
}
