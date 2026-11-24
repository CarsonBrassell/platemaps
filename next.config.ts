import type { NextConfig } from "next";

/*
 * The Content Security Policy, enforced since 2026-11-06. It ran report-only for
 * two months first; on production the only thing it ever flagged was Next's own
 * inline bootstrap scripts, across the feed, the map, restaurant pages and the
 * phone screens.
 *
 * - `script-src` needs `'unsafe-inline'` for those bootstrap scripts. The real
 *   fix is a per-request nonce, which needs dynamic rendering on every page and
 *   gives up the static shells and CDN caching in probe/PERF-PLAN.md. So this
 *   policy does not stop an injected inline script. What it does stop is the
 *   usual next step: loading a script from elsewhere, or sending stolen data
 *   anywhere but this origin (`connect-src`, `form-action`, `base-uri`).
 *   Escaping user text is still the first line (`escapeHtml` in RestaurantMap).
 * - `va.vercel-scripts.com` is `@vercel/analytics`' development fallback;
 *   production serves it from `/_vercel/*`, which `'self'` covers.
 * - `style-src` needs `'unsafe-inline'`: MapLibre sets element styles directly,
 *   and the app uses inline `style={{...}}` throughout.
 * - `img-src https:` because restaurant photos load straight from thousands of
 *   restaurant hosts. `blob:` is the camera and avatar-cropper previews.
 * - `connect-src` has `tiles.openfreemap.org` for the map's vector tiles and
 *   `blob:`/`data:` for reading a picked photo back. Glyphs are same-origin.
 * - `worker-src`/`child-src` allow `blob:` because MapLibre can wrap its
 *   same-origin worker in one.
 * - Development adds what the dev server needs: `'unsafe-eval'` for React's
 *   error overlay and websockets for hot reload. Neither reaches a build.
 *
 * `scripts/check-security.mjs` fails the deploy if this goes back to
 * report-only or picks up `'unsafe-eval'` in production.
 */
const isDev = process.env.NODE_ENV === "development";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' blob: data: https://tiles.openfreemap.org https://va.vercel-scripts.com${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const blobStoreId = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1];
const BLOB_IMAGE_HOST = blobStoreId
  ? `${blobStoreId.toLowerCase()}.public.blob.vercel-storage.com`
  : "*.public.blob.vercel-storage.com";

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
      // Our own Blob store: post photos and avatars. Named exactly when the
      // token is present, because the wildcard covers every Vercel customer's
      // store and would let anyone run their images through this optimizer.
      { protocol: "https", hostname: BLOB_IMAGE_HOST },
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
   * - The CSP is above, with the reasoning for each directive.
   * - `Cross-Origin-Opener-Policy` keeps a page this one opens, or that opened
   *   it, from reaching back through `window.opener`.
   * - `no-store` on auth and account routes keeps anything about a person out
   *   of disk and proxy caches. Other private routes already say so themselves.
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
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/api/account/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
