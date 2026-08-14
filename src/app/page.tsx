import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { getDiscoverPage, parseShown } from "@/lib/discover";

/**
 * Discover, filtered on the server.
 *
 * This page has been three things. It was a client component importing the
 * whole restaurant array, then a server component that read Postgres and handed
 * the whole thing to the client anyway. Both server-rendered a card for every
 * restaurant in the corpus, so the page grew with the table — measured at about
 * 4KB per restaurant, which is a 19MB page at five thousand of them.
 *
 * Now the URL is the query. `searchParams` makes this route dynamic, the
 * filtering happens in lib/discover.ts, and what reaches the browser is one
 * page of results plus the facet counts. Page weight no longer depends on how
 * many restaurants exist.
 *
 * The cost of that is a round trip per filter change where there used to be
 * none. `DiscoverBrowser` spends it through a transition, keeping the previous
 * results on screen rather than blanking the grid — see the note there.
 *
 * Dynamic rather than revalidated: the response now depends on the query
 * string, so there is no single rendering to cache. The expensive part, the
 * corpus read, is cached inside lib/discover.ts instead.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Array.isArray(value) ? value[0] : value] as [string, string]],
    ),
  ).toString();

  const page = await getDiscoverPage(search, { shown: parseShown(params.shown) });

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
          <DiscoverBrowser page={page} />
        </div>
      </div>
    </div>
  );
}
