"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel's two scripts, minus the one-time links. A reset or verification link
 * carries its secret in `?token=`, and a page view reports the whole URL, so
 * the token is cut before the event leaves the browser.
 */
function withoutToken<T extends { url: string }>(event: T): T {
  const url = new URL(event.url);
  if (!url.searchParams.has("token")) return event;
  url.searchParams.delete("token");
  return { ...event, url: url.toString() };
}

export function SiteAnalytics() {
  return (
    <>
      <SpeedInsights beforeSend={withoutToken} />
      <Analytics beforeSend={withoutToken} />
    </>
  );
}
