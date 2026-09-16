import type { MetadataRoute } from "next";

/**
 * `/drafts` (internal design-review surfaces), `/account` and `/m/account`
 * (signed-in-only, nothing for a crawler to index), `/api` (data endpoints,
 * not pages), and `/friends`/`/m/friends` (another visitor's social graph
 * screen) all live at guessable URLs with no auth wall of their own at the
 * page level (see AGENTS.md / SECURITY-FINDINGS.md #20) — keeping them out of
 * the index is a cheap, load-bearing second layer.
 *
 * No `sitemap` field: there is no `src/app/sitemap.ts` yet.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/drafts", "/account", "/m/account", "/api", "/friends", "/m/friends"],
    },
  };
}
