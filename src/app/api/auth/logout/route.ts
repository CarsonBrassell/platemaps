import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessions, saveSessions } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const sessions = getSessions();
    delete sessions[token];
    saveSessions(sessions);
  }

  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
