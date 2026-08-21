import type { NextConfig } from "next";

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
   */
  images: {
    remotePatterns: [
      // Yelp serves business photos from numbered s3-media hosts.
      { protocol: "https", hostname: "*.fl.yelpcdn.com" },
    ],
  },
};

export default nextConfig;
