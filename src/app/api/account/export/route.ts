import { NextResponse } from "next/server";
import { exportUserData } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

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

  const data = await exportUserData(user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="platemaps-${user.name}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
