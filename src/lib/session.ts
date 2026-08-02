import { cookies } from "next/headers";
import { getSessionUserId, getUserById, type User } from "@/lib/db";

export const SESSION_COOKIE = "platemap_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await getSessionUserId(token);
  if (!userId) return null;

  return getUserById(userId);
}
