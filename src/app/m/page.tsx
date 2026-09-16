import { PhoneDiscoverScreen } from "@/components/mobile/PhoneDiscoverScreen";
import { getDiscoverPage } from "@/lib/discover";
import { PAGE_SIZE } from "@/lib/discoverFilters";

/*
 * A static shell, the same way `/` is (see src/app/page.tsx and
 * probe/PERF-PLAN.md S3). The server renders the unfiltered first page once
 * a minute at most; the filters, the search and Show more are all still URLs
 * (`/m?cuisine=Thai&shown=48`) and PhoneDiscoverScreen answers them by
 * fetching the filtered page from /api/restaurants/discover. The URL reaches
 * it through the QuerySync leaf in m/layout.tsx (see lib/queryString.ts).
 */
export const revalidate = 60;

export default async function PhoneDiscover() {
  const page = await getDiscoverPage("", { shown: PAGE_SIZE, here: null });

  return (
    <PhoneDiscoverScreen initial={page} />
  );
}
