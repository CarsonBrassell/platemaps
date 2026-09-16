import type { NextConfig } from "next";

/*
 * Report-only CSP, built from what the app actually loads (see the audit in
 * probe/SECURITY-FINDINGS.md #5). It is report-only on purpose: a directive
 * that is one host short of correct silently breaks the map or an upload
 * instead of just logging, so this ships as `Content-Security-Policy-Report-Only`
 * first, gets watched in the browser console (and Vercel logs, once a
 * `report-to`/`report-uri` endpoint exists) for a real traffic cycle, and only
 * then does someone flip it to enforced and drop the duplicate `frame-ancestors`
 * below. Before enforcing: confirm no console violations across `/`, `/feed`,
 * `/post`, `/m/post`, a restaurant page, and sign-in/sign-up (password
 * manager extensions can trigger their own violations that are not the app's).
 *
 * - `script-src`/`connect-src` allow `va.vercel-scripts.com` because
 *   `@vercel/analytics` and `@vercel/speed-insights` fall back to that host
 *   in dev; production serves both from `/_vercel/*` on this origin, which
 *   `'self'` already covers.
 * - `style-src` needs `'unsafe-inline'`: MapLibre GL sets element styles
 *   directly, `src/components/drafts/fieldShapes.tsx` and
 *   `draftSearchStyles.tsx` inject `<style>` tags via `dangerouslySetInnerHTML`,
 *   and the app uses plenty of inline `style={{...}}` props. None of that is
 *   nonce-able without a rewrite, so this is a deliberate, not overlooked, gap.
 * - `img-src` covers `blob:` for the camera-capture and avatar-cropper
 *   previews (`URL.createObjectURL`), `*.fl.yelpcdn.com` for Yelp photos, and
 *   the Vercel Blob host for user post/avatar photos.
 * - `connect-src` covers `tiles.openfreemap.org` (MapLibre vector tiles) —
 *   glyphs are same-origin (`GLYPHS_ORIGIN` in `src/lib/mapStyle.ts`).
 * - `worker-src`/`child-src` allow `blob:` for MapLibre's worker; the worker
 *   script itself is same-origin (`public/maplibre-gl-worker.mjs`, see
 *   `setWorkerUrl` in `RestaurantMap.tsx`), but some MapLibre builds wrap it
 *   in a blob URL under the hood, so this stays permissive rather than
 *   guessing wrong and silently killing the map.
 * - No `'unsafe-eval'` — nothing found that needs it (MapLibre and Tailwind's
 *   runtime do not eval). Leave it out unless something concrete requires it.
 */
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  // https: because restaurant photos (RestaurantPhoto, unoptimized) load
  // straight from thousands of restaurant hosts; user photos stay on Blob.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://tiles.openfreemap.org https://va.vercel-scripts.com",
  "worker-src 'self' blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /*
   * Opening the dev server from a phone on the same wifi (http://<mac-lan-ip>:3000)
   * needs the LAN origin listed here. Without it Next blocks cross-origin requests
   * to `/_next/*`, and the failure is silent and misleading: the page renders, but
   * every `next/dynamic` chunk 404s, so the phone map sits on "Loading map…"
   * forever while the same route is fine on localhost.
   *
   * A subnet wildcard rather than one address because the Mac's IP is DHCP and
   * moves. Development only — `allowedDevOrigins` has no effect on a build.
   */
  allowedDevOrigins: ["192.168.0.*"],

  // Stop announcing the framework in every response (`X-Powered-By: Next.js`) —
  // free reconnaissance for an attacker, no benefit to a real visitor.
  poweredByHeader: false,

  /*
   * Restaurant photos served from `public/` (e.g. `/restaurants/kono.jpg`) work
   * with no configuration.
   *
   * Photos hosted somewhere else do not: next/image refuses any host that isn't
   * listed here, so a remote URL in `restaurants.ts` will throw at render time
   * until its host is added. Add one entry per host, e.g.
   *
   *   images: {
   *     remotePatterns: [{ protocol: "https", hostname: "images.example.com" }],
   *   },
   *
   * This used to also carry `{ hostname: "**" }` so any restaurant's own hero
   * image — from five thousand different hosts — could be optimized. That made
   * `/_next/image` a free, cookie-less proxy for any https image on the
   * internet (probe/SECURITY-FINDINGS.md #6): attacker-chosen bytes decoded by
   * `sharp` on Vercel's metered image pipeline, plus a narrow SSRF (any https
   * host, image responses only). The restaurant-photo column still holds URLs
   * from arbitrary hosts, so `RestaurantPhoto` (`src/components/RestaurantPhoto.tsx`)
   * now renders those with `unoptimized`, which skips `/_next/image` entirely —
   * the browser fetches the URL directly, same as a plain `<img>`, and this
   * allowlist no longer needs to cover it. What's left here is only the hosts
   * that still go through the optimizer: Yelp's CDN and our own Vercel Blob
   * bucket (user post photos and avatars, uploaded by `src/lib/photos.ts`).
   * If a future surface needs to optimize an arbitrary-host image again, that
   * is a new wildcard decision to make deliberately, not something to restore
   * by habit.
   */
  images: {
    remotePatterns: [
      // Yelp serves business photos from numbered s3-media hosts.
      { protocol: "https", hostname: "*.fl.yelpcdn.com" },
      // Vercel Blob's per-store subdomain — user-uploaded post photos and avatars.
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },

  /*
   * Security headers (probe/SECURITY-FINDINGS.md #5). Applied to every route —
   * this is a small app with no CDN-cached asset path that needs a different
   * policy, so one entry for `/:path*` is enough.
   *
   * - HSTS without `preload`: `preload` is a one-way submission to the browser
   *   preload list that is very slow to reverse, so that's the domain owner's
   *   call, not something to bake into a config file.
   * - `X-Frame-Options: DENY` + enforced `frame-ancestors 'none'` say the same
   *   thing twice on purpose — the header covers browsers that predate
   *   `frame-ancestors`.
   * - `Permissions-Policy` allows camera and geolocation for this origin only
   *   (used on `/post`, `/m/post`, and the map) and turns off everything else
   *   this app has no use for.
   * - The enforced CSP only pins down `frame-ancestors` for now; the full
   *   policy ships report-only until it's been watched for violations (see
   *   `REPORT_ONLY_CSP` above).
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: REPORT_ONLY_CSP,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
