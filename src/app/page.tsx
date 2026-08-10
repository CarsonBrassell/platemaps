import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { getRestaurants } from "@/lib/db";

/**
 * Rebuilt at most every five minutes, rather than frozen at deploy time.
 *
 * When the array was a static import this page was baked once per build, and
 * making it a server component that reads Postgres would have kept exactly that
 * behaviour — Next prerenders an `async` page with no dynamic inputs — so a
 * `npm run restaurants:import` would have changed nothing until the next
 * deploy. That is the wrong default for data a script now writes.
 *
 * Revalidation rather than `force-dynamic`: the page is public and identical
 * for every visitor, so one render shared by everyone for five minutes is the
 * right trade against a database round trip per visit. The number is a
 * freshness budget — lower it while importing, raise it once the corpus
 * settles.
 */
export const revalidate = 300;

/**
 * A server component now, where it used to be `"use client"`.
 *
 * That directive was the whole problem: it made every module this page
 * imported part of the browser bundle, including the full restaurant array.
 * Reading the rows here and passing them down means the query cost is paid
 * once on the server, and it is the seam that lets a later change hand
 * `DiscoverBrowser` a page of results instead of the corpus.
 */
export default async function Home() {
  const restaurants = await getRestaurants();

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
