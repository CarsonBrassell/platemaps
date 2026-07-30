import { cookies } from "next/headers";
import { getSessions, getUsers, type User } from "@/lib/db";

export const SESSION_COOKIE = "platemap_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessions = getSessions();
  const userId = sessions[token];
  if (!userId) return null;

  const users = getUsers();
  return users.find((u) => u.id === userId) ?? null;
}
