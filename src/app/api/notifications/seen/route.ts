import { NextResponse } from "next/server";
import { markNotificationsSeen } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

/** Stamp "the caller just opened the notification center". */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const limited = await limitOrReject({
    scope: "notifications-seen:user",
    key: user.id,
    max: 120,
    windowMinutes: 60,
  });
  if (limited) return limited;

  await markNotificationsSeen(user.id);
  return NextResponse.json({ ok: true });
}
