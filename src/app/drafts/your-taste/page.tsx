import Link from "next/link";
import { Header } from "@/components/Header";
import { RestaurantCard } from "@/components/RestaurantCard";
import { PhoneRestaurantCardGrid } from "@/components/mobile/PhoneRestaurantCardGrid";
import type { RestaurantView } from "@/data/restaurantTypes";
import type { PlateScore } from "@/lib/plateScore";

/**
 * DRAFT: "Your taste", the private picks section at the top of Discover.
 * Web and phone, from hard-coded restaurants through the real cards. See
 * probe/your-taste/DESIGN.md. Nothing is fetched and nothing imports this
 * page; deleting the folder removes it.
 */
const view = (
  id: string,
  name: string,
  cuisine: string,
  neighborhood: string,
  rating: number | null,
  reviewCount: number | null,
  photo?: string,
  photoAlt?: string,
): RestaurantView => ({
  id,
  name,
  cuisine,
  cuisineTags: cuisine,
  neighborhood,
  distance: "",
  hours: null,
  priceBand: null,
  lat: 32.75,
  lng: -117.15,
  rating,
  reviewCount,
  photo,
  photoAlt,
});

const MENDOCINO_PHOTO =
  "https://70xwh4kizzssi7so.public.blob.vercel-storage.com/posts/940561ca-05c8-4010-b8a9-f397235378b9/44f4f13c-5eb5-4b18-9f51-8a26614ba6e3.jpg";

const NO_PLATES: PlateScore = { percent: null, dishCount: 0, ratingCount: 0, ready: false };
const READY: PlateScore = { percent: 86, dishCount: 5, ratingCount: 14, ready: true };

type Pick = {
  r: RestaurantView;
  score: PlateScore;
  webReason: string;
  phoneReason: string;
};

const PICKS: Pick[] = [
  {
    r: view("d1", "Tajima Ramen Convoy", "Japanese", "Convoy", 4.4, 1210),
    score: READY,
    webReason: "Sam posted here",
    phoneReason: "Sam posted here",
  },
  {
    r: view("d2", "Hodad's", "Burgers", "Ocean Beach", 4.3, 6400),
    score: NO_PLATES,
    webReason: "You picked Burgers",
    phoneReason: "You picked Burgers",
  },
  {
    r: view(
      "d3",
      "Mendocino Farms",
      "Sandwiches",
      "Little Italy",
      4.4,
      1900,
      MENDOCINO_PHOTO,
      "Chicken Parm Dip at Mendocino Farms",
    ),
    score: NO_PLATES,
    webReason: "You've been to 3 Sandwiches places",
    phoneReason: "Been to 3 Sandwiches places",
  },
  {
    r: view("d4", "Rubio's Baja Grill", "Mexican", "Pacific Beach", 4.0, 820),
    score: NO_PLATES,
    webReason: "You've been to 2 Mexican places",
    phoneReason: "Been to 2 Mexican places",
  },
  {
    r: view("d5", "Underbelly", "Japanese", "Little Italy", 4.5, 2300),
    score: NO_PLATES,
    webReason: "You picked Japanese",
    phoneReason: "You picked Japanese",
  },
];

const SELECTED = ["Japanese", "Burgers"];
const SUGGESTED = ["Thai", "Pizza", "Sandwiches", "Mexican", "Italian"];
const COLD_CHIPS = [
  "Mexican",
  "Japanese",
  "Pizza",
  "Thai",
  "Burgers",
  "Italian",
  "Sandwiches",
  "Coffee & Tea",
  "Bakery & Desserts",
];

const CHIP_ON =
  "inline-flex shrink-0 items-center rounded-full bg-pm-orange text-[13px] font-medium text-[#F7F4EC]";
const CHIP_OFF =
  "inline-flex shrink-0 items-center rounded-full bg-pm-grey-tint text-[13px] font-medium text-pm-grey-text";
const BTN = "text-[13px] font-medium text-zinc-500 underline-offset-2 hover:underline";

function WebStub() {
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="mono-label text-zinc-500">Our picks</h2>
        <span className="mono-label text-zinc-400">Featured this week</span>
      </div>
      <div className="mb-7 h-14 rounded-2xl bg-white/60" />
      <h2 className="mono-label mb-3 px-1 text-zinc-500">All restaurants</h2>
    </>
  );
}

function ColdWeb() {
  return (
    <section aria-labelledby="yt-cold-web" className="mb-7">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 id="yt-cold-web" className="mono-label text-zinc-500">
          Your taste
        </h2>
      </div>
      <p className="mb-3 px-1 text-[14px] text-pm-grey-text">
        What do you like? Pick up to 3 and we&apos;ll start finding places.
      </p>
      <div className="mb-3 flex flex-wrap gap-2 px-1">
        {[...COLD_CHIPS, "More"].map((l) => (
          <span key={l} className={`${CHIP_OFF} min-h-9 px-3.5`}>
            {l}
          </span>
        ))}
      </div>
      <Link href="/post" className="px-1 text-[13px] text-zinc-500 underline underline-offset-2">
        Post a plate and we&apos;ll learn where you eat
      </Link>
    </section>
  );
}

function ColdPhone() {
  return (
    <section aria-labelledby="yt-cold-phone" className="px-4 py-4">
      <h2 id="yt-cold-phone" className="mono-label mb-1.5 text-zinc-500">
        Your taste
      </h2>
      <p className="mb-3 text-[13px] text-pm-grey-text">
        What do you like? Pick up to 3 and we&apos;ll start finding places.
      </p>
      <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 pb-1">
          {[...COLD_CHIPS, "More"].map((l) => (
            <span key={l} className={`${CHIP_OFF} min-h-11 px-4`}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <Link
        href="/m/post"
        className="mt-2 inline-flex min-h-11 items-center text-[13px] text-zinc-500 underline underline-offset-2"
      >
        Post a plate and we&apos;ll learn where you eat
      </Link>
    </section>
  );
}

export default function YourTasteDraftPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8">
        <h1 className="text-[32px]">Your taste</h1>
        <p className="mt-1.5 max-w-[70ch] text-[14px] text-pm-grey-text">
          Proposed Discover section, not approved. Real cards, invented props. Persona: 7 places
          across Mission Beach, Pacific Beach and La Jolla, loves Japanese and Burgers, friend Sam
          posted at Tajima Ramen Convoy.
        </p>

        <p className="mono-label mb-3 mt-8 text-zinc-900">Web, signed in with history</p>
        <div className="max-w-[900px]">
          <section aria-labelledby="yt-web" className="mb-7">
            <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
              <h2 id="yt-web" className="mono-label text-zinc-500">
                Your taste
              </h2>
              <span className="mono-label text-zinc-400">
                Based on 7 places you&apos;ve been and 2 picks ·{" "}
                <a href="#edit" className="underline underline-offset-2">
                  Edit
                </a>
              </span>
            </div>
            <div className="mb-4 flex flex-wrap gap-2 px-1">
              {SELECTED.map((l) => (
                <span key={l} className={`${CHIP_ON} min-h-9 px-3.5`}>
                  {l}
                </span>
              ))}
              {SUGGESTED.map((l) => (
                <span
                  key={l}
                  className={`${CHIP_OFF} min-h-9 border border-zinc-300 bg-transparent px-3.5`}
                >
                  {l}
                </span>
              ))}
              <span className={`${CHIP_OFF} min-h-9 px-3.5`}>More</span>
            </div>
            <div className="mb-2 flex justify-end px-1">
              <a href="#all" className="mono-label text-zinc-500 underline underline-offset-2">
                See all
              </a>
            </div>
            <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-4">
                {PICKS.map((p) => (
                  <div key={p.r.id} className="w-[240px] shrink-0">
                    <RestaurantCard restaurant={p.r} score={p.score} shape="crop" />
                    <p className="mt-2 px-1 text-[13px] text-zinc-500">{p.webReason}</p>
                    <div className="mt-1 flex gap-4 px-1">
                      <button type="button" className={BTN}>
                        Been here
                      </button>
                      <button type="button" className={BTN}>
                        Not for me
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <WebStub />
        </div>

        <p className="mono-label mb-3 mt-12 text-zinc-900">Phone (390px)</p>
        <div className="w-[390px] max-w-full overflow-hidden rounded-[28px] border-2 border-zinc-300">
          <div className="px-4 pb-2 pt-4">
            <div className="h-11 rounded-full bg-white/80 px-4 text-[13px] leading-[44px] text-zinc-400">
              Search restaurants
            </div>
          </div>
          <section aria-labelledby="yt-phone" className="pb-4 pt-2">
            <div className="flex items-baseline justify-between gap-3 px-4">
              <h2 id="yt-phone" className="mono-label text-zinc-500">
                Your taste
              </h2>
              <a href="#edit" className="mono-label text-zinc-500 underline underline-offset-2">
                Edit
              </a>
            </div>
            <p className="mb-2 px-4 text-[12px] text-zinc-400">Based on 7 places and 2 picks</p>
            <div className="overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2 pb-1">
                {SELECTED.map((l) => (
                  <span key={l} className={`${CHIP_ON} min-h-11 px-4`}>
                    {l}
                  </span>
                ))}
                {["Thai", "Pizza", "Sandwiches", "More"].map((l) => (
                  <span key={l} className={`${CHIP_OFF} min-h-11 px-4`}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {PICKS.map((p) => (
                <div key={p.r.id} className="w-[170px] shrink-0 snap-start">
                  <PhoneRestaurantCardGrid restaurant={p.r} score={p.score} />
                  <p className="mt-2 truncate px-0.5 text-[13px] text-zinc-500">{p.phoneReason}</p>
                  <div className="flex gap-3">
                    <button type="button" className={`${BTN} min-h-11`}>
                      Been here
                    </button>
                    <button type="button" className={`${BTN} min-h-11`}>
                      Not for me
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="px-4 pb-4">
            <h2 className="mono-label mb-2 text-zinc-500">Our picks</h2>
            <div className="h-12 rounded-xl bg-white/60" />
          </div>
        </div>

        <p className="mono-label mb-3 mt-12 text-zinc-900">
          Cold start, what anonymous visitors see
        </p>
        <div className="max-w-[900px]">
          <ColdWeb />
        </div>
        <div className="mt-4 w-[390px] max-w-full overflow-hidden rounded-[28px] border-2 border-zinc-300">
          <ColdPhone />
        </div>

        <p id="edit" className="mono-label mb-3 mt-12 text-zinc-900">
          Edit panel open, with Undo
        </p>
        <div className="max-w-[900px]">
          <div className="mb-3 flex items-center justify-between rounded-xl bg-pm-grey-tint px-4 py-2.5 text-[13px] text-pm-grey-text">
            <span>Hidden Hodad&apos;s. Not for me affects Your taste only.</span>
            <button
              type="button"
              className="font-medium text-pm-orange-text underline underline-offset-2"
            >
              Undo
            </button>
          </div>
          <div className="rounded-2xl bg-white p-5">
            <p className="mono-label mb-2 text-zinc-500">I love (up to 5)</p>
            <div className="mb-5 flex flex-wrap gap-2">
              {SELECTED.map((l) => (
                <span key={l} className={`${CHIP_ON} min-h-9 px-3.5`}>
                  {l}
                </span>
              ))}
              {["Thai", "Pizza", "Sandwiches", "Mexican"].map((l) => (
                <span key={l} className={`${CHIP_OFF} min-h-9 px-3.5`}>
                  {l}
                </span>
              ))}
            </div>
            <p className="mono-label mb-2 text-zinc-500">Not into (up to 5)</p>
            <div className="mb-5 flex flex-wrap gap-2">
              <span className={`${CHIP_ON} min-h-9 px-3.5`}>Bars</span>
              {["Vegan", "Seafood", "Steakhouse"].map((l) => (
                <span key={l} className={`${CHIP_OFF} min-h-9 px-3.5`}>
                  {l}
                </span>
              ))}
            </div>
            <button type="button" className={BTN}>
              Reset my taste
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
