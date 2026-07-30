import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getUsers, saveUsers, getSessions, saveSessions } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  const users = getUsers();
  if (users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: randomUUID(), name, email, passwordHash, points: 0 };
  users.push(user);
  saveUsers(users);

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
