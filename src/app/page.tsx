import { Suspense } from "react";
import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { QuerySync } from "@/components/QuerySync";
import { getDiscoverPage } from "@/lib/discover";
import { PAGE_SIZE } from "@/lib/discoverFilters";

/*
 * A static shell (probe/PERF-PLAN.md S3). The page reads nothing from the
 * request — no searchParams, no cookies — so Next prerenders it and the CDN
 * serves the HTML; the unfiltered first page is regenerated at most once a
 * minute, which is also how long the corpus cache lives. Any query string on
 * the URL is answered client-side by DiscoverBrowser fetching the filtered
 * page from /api/restaurants/discover (lib/useDiscoverQuery.ts). This is why
 * `/` went from ~1 s of server render to a CDN hit.
 */
export const revalidate = 60;

export default async function Home() {
  const page = await getDiscoverPage("", { shown: PAGE_SIZE, here: null });

  return (
    <div className="mx-auto w-full max-w-7xl pb-12">
      <Suspense fallback={null}>
        <QuerySync />
      </Suspense>
      <Header />
      <StatsBar />

      <div className="flex w-full gap-6 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <DiscoverBrowser initial={page} />
        </div>
      </div>
    </div>
  );
}
