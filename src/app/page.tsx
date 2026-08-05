import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { restaurants } from "@/data/restaurants";

export default function Home() {
  return (
    <div className="app-shell mx-auto my-6 w-full max-w-6xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />
      <StatsBar />
      {/* Filters sit beside the content rather than below the picks strip, so
          the rail starts level with the top of the page. */}
      <DiscoverBrowser restaurants={restaurants} />
    </div>
  );
}
