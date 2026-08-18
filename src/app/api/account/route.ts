import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { deleteUser, deleteSession } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Deletes the signed-in user's own account. Requires re-entering the
 * password in the body, the same check `/api/auth/login` makes — a
 * destructive, irreversible action shouldn't be reachable from an unlocked
 * device just because a session cookie is still valid.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { password } = await req.json();
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  // deleteUser cascades the session row too, but the browser's cookie is a
  // separate thing to clear — and clearing it here means the response only
  // ever reaches the browser once the account is actually gone.
  await deleteUser(user.id);
  if (token) await deleteSession(token);
  cookieStore.delete(SESSION_COOKIE);

  return NextResponse.json({ ok: true });
}
