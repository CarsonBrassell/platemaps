import type { Metadata, Viewport } from "next";
import { Fraunces, Spline_Sans_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { CoachTourMount } from "@/components/tour/CoachTourMount";
import "./globals.css";

/* The machine voice: every number and machine-generated value — prices,
   percentages, vote counts, timestamps, usernames, section labels — sets in
   this face. Chosen over a code-editor mono for its soft terminals, which
   match the pill-and-card shape language. */
const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

/* SOFT and WONK are Fraunces' own variable axes. WONK swaps in the swashed,
   canted letterforms the family is named for — it's what makes this read as a
   chosen display face rather than a generic serif. Requested explicitly here
   because next/font only ships the axes you name. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "PlateMaps",
  description: "Find great food near you in San Diego, ranked by what's happening right now.",
  /**
   * `appleWebApp` is what makes an added-to-home-screen PlateMaps open as the
   * app rather than inside Safari. iOS ignores the web manifest's `display`
   * field — `manifest.ts` still declares it for Android — so without this the
   * icon is a bookmark that opens a browser tab with a URL bar above it.
   *
   * `statusBarStyle: "black-translucent"` is what makes the page reach the
   * physical top edge. The alternative, "default", reserves a native strip
   * above the web viewport and fills it with the page's own colour — which put
   * a cream bar across the top of the map screen, where the map is supposed to
   * run edge to edge. That strip cannot be reached from inside the document:
   * it is outside the viewport, and `env(safe-area-inset-top)` reads 0 in that
   * mode, so the page can pick its colour and nothing else. "black-translucent"
   * removes the strip instead of colouring it — the page now owns those pixels,
   * the insets become real, and the padding this layout already spends on
   * `env(safe-area-inset-top)` (see the viewport export below) is what keeps
   * ordinary screens clear of the clock. It is also how the Capacitor build has
   * always rendered, so the phone tree is being asked for a layout it is known
   * to get right.
   *
   * The cost is the clock itself: "black-translucent" paints the status bar
   * glyphs white on every screen, and they sit over cream on everything but the
   * map. Deliberate — the map reaching the top edge is the thing being bought.
   */
  appleWebApp: {
    capable: true,
    title: "PlateMaps",
    statusBarStyle: "black-translucent",
  },
  /**
   * `appleWebApp.capable` makes Next emit only the modern
   * `mobile-web-app-capable`; it dropped the `apple-` prefixed name because
   * Chrome warns about it. Older iOS reads only the prefixed one, so standalone
   * mode depends on which iOS a friend happens to have. Emitting both removes
   * the question — the legacy tag is two dozen bytes and is ignored by every
   * browser that prefers the standard one.
   */
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

/**
 * `viewport-fit=cover` is the reason this export exists, and it is load-bearing
 * rather than cosmetic: `env(safe-area-inset-*)` resolves to `0px` unless the
 * viewport meta opts in. Six places already spend those insets — MobileNav's
 * bottom row, the `body` padding in globals.css, DishSheet, feed/Dialog and the
 * composer's action bar — and every one of them was silently getting zero on a
 * notched iPhone, which is to say the bottom nav sat under the home indicator.
 *
 * Next emits `width=device-width, initial-scale=1` by default but not
 * `viewportFit`, so declaring it here is the whole fix.
 *
 * `maximumScale` and `userScalable` are deliberately left alone. Locking zoom
 * is the usual next line in a snippet like this and it is an accessibility
 * failure — pinch-zoom is how low-vision users read a menu.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#F7F4EC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${splineMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The brand mark, asked for before React has run. Every screen paints
            it, so it should never be discovered late — a preload starts the
            fetch while the document is still parsing instead of waiting for
            the component tree. React hoists this into <head>.

            React also emits its own preload for the same file, off the
            <source> inside BrandMark, so the head carries two — identical
            hrefs, which every browser dedupes into one fetch. This one stays
            because it is declared at the root and so flushes in the first
            streamed chunk no matter where the mark sits in the tree, while
            React's arrives whenever that component renders.

            `type` so a browser without WebP skips it rather than downloading a
            file it cannot decode; the <picture> in BrandMark hands that case
            the PNG. It is 7.6KB, small enough that preloading it costs nothing
            on a screen that somehow doesn't show it. */}
        <link rel="preload" as="image" type="image/webp" href="/logo-mark-240.webp" />
        {/*
          THESIS: warm, airy, photo-forward food app with an editorial layer —
          typography with a point of view, not a template. Refuses the
          all-sans food-app default.
          OWN-WORLD: cream #F7F4EC ground; white borderless shadowless cards
          14–16px; pill chips/tabs/buttons; tan #EDE8DC neutral chips; one
          accent #C9591F reserved for percentages, selected state, primary
          action. Fraunces 600–700 for proper names and titles; Spline Sans
          Mono for every machine value; system sans for prose.
          STORY: visitor lands, recognizes a considered food guide, reads the
          hits, and leaves knowing which plate to order.
          FIRST VIEWPORT: restaurant page — photo card, SPOT № label, Fraunces
          name, metadata pills, THE HITS dish grid with orange percentages.
          FORM: brief-pinned by the user; no seed roll.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, and DESIGN.md.
        */}
        <AuthProvider>
          {children}
          {/* The first-run walkthrough. Here rather than on a page because
              every step of it ends in a navigation — see CoachTourMount. */}
          <CoachTourMount />
        </AuthProvider>
      </body>
    </html>
  );
}
