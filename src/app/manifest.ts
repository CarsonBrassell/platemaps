import type { MetadataRoute } from "next";

/**
 * The web manifest, so the phone tree can be added to a home screen and behave
 * like the app rather than like a bookmark.
 *
 * **This is the zero-friction way to get someone into PlateMaps.** TestFlight
 * needs a build, an Apple Developer team, and — for anyone outside the team —
 * Beta App Review before a single tester can install. A link needs none of
 * that, works on Android as well as iOS, and updates the moment a deploy lands
 * instead of on the next binary. The native shell still matters (it is what
 * ships to the App Store, and what can hold push and a native camera later),
 * but it is not the fastest way to hand the app to ten friends.
 *
 * `start_url` is the phone tree, not `/`. Someone installing this from a
 * phone wants `/m`, and the web tree's desktop layout is not what should open
 * from a home-screen icon.
 *
 * `display: "standalone"` drops Safari's chrome. Two consequences worth
 * knowing rather than discovering: there is no browser back button, so the
 * app's own bottom nav is the only way around — which the `/m` tree is already
 * built for — and an installed instance gets its own cookie jar, so a friend
 * who signed in inside Safari signs in once more after installing.
 *
 * The icons are opaque cream by way of `square()` in build-logo-assets.mjs.
 * iOS masks the corners itself and paints black through any transparency, so
 * a cut-out mark would land on the home screen inside a black box.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlateMaps",
    short_name: "PlateMaps",
    description:
      "Find great food near you in San Diego, ranked by what's happening right now.",
    start_url: "/m/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    /* Both the cream ground, so the launch screen does not flash white before
       the app paints — the same #F7F4EC the viewport's themeColor already
       declares in layout.tsx. */
    background_color: "#F7F4EC",
    theme_color: "#F7F4EC",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      /* `purpose: "maskable"` lets Android crop to its own shape instead of
         drawing the square inside a white circle. Safe because the artwork is
         padded and sits on an opaque ground. */
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
