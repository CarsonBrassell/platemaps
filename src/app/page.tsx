import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { Sidebar } from "@/components/Sidebar";
import { RestaurantCard } from "@/components/RestaurantCard";
import { restaurants } from "@/data/restaurants";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col">
      <Header />
      <StatsBar />
      <div className="flex flex-1 gap-4 bg-white px-5 py-4 dark:bg-black">
        <Sidebar />
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      </div>
    </div>
  );
}
