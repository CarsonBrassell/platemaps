"use client";

import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { restaurants } from "@/data/restaurants";

export default function Home() {
  return (
    /* No shell card: the cream page is the ground.
     *
     * Discover carries no navigation chrome of its own any more — no side
     * rail, no bottom bar. The app header is the whole of it, which leaves the
     * page to do the one thing it exists for: browsing restaurants. Both nav
     * components are kept in archive/nav for the mobile app.
     */
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Header />
      <StatsBar />

      <div className="flex w-full gap-6 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <DiscoverBrowser restaurants={restaurants} />
        </div>
      </div>
    </div>
  );
}
