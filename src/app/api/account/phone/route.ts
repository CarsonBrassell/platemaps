import { NextResponse } from "next/server";
import { accountJson } from "@/lib/account";
import { clearPhone, getUserById } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";
import { phoneVerifyAvailable } from "@/lib/contactsConfig";

/**
 * Take the caller's phone number off their account.
 *
 * This is the withdraw-consent control: the keyed hash, the last four digits
 * and the confirmation time are cleared together, at once, and the account
 * stops being findable by that number on the very next check.
 *
 * No password. It removes something from the caller's own account and cannot
 * be used to move or expose anything; the worst a borrowed phone does with it
 * is make its owner add the number again.
 */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Not configured for this deployment: do nothing at all. The one exception
  // is an account that already has a number on file (the feature was on and
  // was later switched off) — removing it must keep working regardless.
  if (!phoneVerifyAvailable() && user.phoneVerifiedAt === undefined) {
    return NextResponse.json({ error: "Not available.", code: "unavailable" }, { status: 404 });
  }

  const limited = await limitOrReject({
    scope: "account-phone:user",
    key: user.id,
    max: 10,
    windowMinutes: 60,
  });
  if (limited) return limited;

  await clearPhone(user.id);

  const fresh = await getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  return NextResponse.json(accountJson(fresh));
}
