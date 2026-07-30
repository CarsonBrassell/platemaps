import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessions, getUsers } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ user: null });

  const sessions = getSessions();
  const userId = sessions[token];
  if (!userId) return NextResponse.json({ user: null });

  const users = getUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, points: user.points },
  });
}
