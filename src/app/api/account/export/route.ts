import { NextResponse } from "next/server";
import { exportUserData, listIdentities } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { limitOrReject } from "@/lib/rateLimit";

/**
 * Download everything this account has written, as one JSON file.
 *
 * Takes no user id and must never grow one — same rule as
 * `/api/account/activity`. The only account it can ever export is the caller's,
 * because the id comes from the session and nowhere else.
 *
 * `Content-Disposition: attachment` so a browser saves it instead of rendering
 * a wall of JSON in a tab, and `no-store` so a personal export doesn't sit in a
 * shared cache anywhere between here and the disk.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await limitOrReject({
    scope: "account-export:user",
    key: user.id,
    max: 10,
    windowMinutes: 60,
  });
  if (limited) return limited;

  const [data, identities] = await Promise.all([exportUserData(user.id), listIdentities(user.id)]);
  // Which providers are connected and the address each gave — the two things
  // stored about them that are the person's own. Picked field by field so the
  // provider's user number and the sealed Apple token can never ride along.
  const signInMethods = identities.map((i) => ({ provider: i.provider, email: i.email }));
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify({ ...data, signInMethods }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="platemaps-${user.name}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
