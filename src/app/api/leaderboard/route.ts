import { NextResponse } from "next/server";
import { getUsers, effectiveMonthlyPoints } from "@/lib/db";

export async function GET() {
  const users = getUsers();

  const leaderboard = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      monthlyPoints: effectiveMonthlyPoints(u),
    }))
    .filter((u) => u.monthlyPoints > 0)
    .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
    .slice(0, 10);

  return NextResponse.json({ leaderboard });
}
