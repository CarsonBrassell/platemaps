import type { Metadata } from "next";
import { Fraunces, Spline_Sans_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
