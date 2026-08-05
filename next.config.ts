import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
