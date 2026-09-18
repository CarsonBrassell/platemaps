import type { MetadataRoute } from "next";

/**
 * `/drafts` (internal design-review surfaces), `/account` and `/m/account`
 * (signed-in-only, nothing for a crawler to index), `/api` (data endpoints,
 * not pages), and `/friends`/`/m/friends` (another visitor's social graph
 * screen) all live at guessable URLs. `src/proxy.ts` now sits in front of all
 * of them (Calvin's decision, 2026-09-17: the whole app requires sign-in), so
 * this list is no longer the only thing keeping a crawler out — it stays
 * anyway as a cheap, load-bearing second layer, and because a search engine
 * has no session to redirect.
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
