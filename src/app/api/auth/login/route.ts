import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUsers, getSessions, saveSessions } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  const users = getUsers();
  const user = users.find(
    (u) => u.email.toLowerCase() === String(email).toLowerCase()
  );

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "That email and password don't match an account." },
      { status: 401 }
    );
  }

  const token = randomUUID();
  const sessions = getSessions();
  sessions[token] = user.id;
  saveSessions(sessions);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    points: user.points,
  });
}
