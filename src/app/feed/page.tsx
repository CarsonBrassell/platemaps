import { Header } from "@/components/Header";

const activity = [
  {
    id: "1",
    text: "Karina's Tacos just posted a special: fish taco plate, $12",
    place: "Karina's Tacos · Ocean Beach",
    time: "12m ago",
  },
  {
    id: "2",
    text: "Mariscos German is running with no wait right now",
    place: "Mariscos German · Barrio Logan",
    time: "28m ago",
  },
  {
    id: "3",
    text: "5 people checked in at Communal Coffee in the last hour",
    place: "Communal Coffee · North Park",
    time: "1h ago",
  },
  {
    id: "4",
    text: "Herb and Wood is filling up, wait climbing to 25 min",
    place: "Herb and Wood · Little Italy",
    time: "2h ago",
  },
];

export default function FeedPage() {
  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex flex-col gap-3 bg-white px-5 py-4">
        {activity.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <p className="mb-1 text-sm">{item.text}</p>
            <p className="text-xs text-zinc-500">
              {item.place} &middot; {item.time}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
