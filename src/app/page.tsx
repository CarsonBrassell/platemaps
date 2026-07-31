import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { Sidebar } from "@/components/Sidebar";
import { RestaurantCard } from "@/components/RestaurantCard";
import { OurPicks } from "@/components/OurPicks";
import { restaurants } from "@/data/restaurants";

export default function Home() {
  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <StatsBar />
      <OurPicks />
      <div className="flex gap-4 bg-white px-5 py-4">
        <Sidebar />
        <div className="flex-1 border-l border-zinc-100 pl-4">
          <div className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
