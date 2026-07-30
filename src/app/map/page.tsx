"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { neighborhoods } from "@/data/restaurants";

export default function MapPage() {
  const [selected, setSelected] = useState(neighborhoods[0]);
  const query = encodeURIComponent(`${selected}, San Diego, CA`);

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex flex-col gap-4 bg-white px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map((neighborhood) => (
            <button
              key={neighborhood}
              onClick={() => setSelected(neighborhood)}
              className={
                neighborhood === selected
                  ? "rounded-full bg-pm-orange-tint px-3 py-1.5 text-sm font-medium text-pm-orange-text transition-colors"
                  : "rounded-full bg-pm-grey-tint px-3 py-1.5 text-sm text-pm-grey-text transition-colors hover:bg-zinc-200"
              }
            >
              {neighborhood}
            </button>
          ))}
        </div>
        <iframe
          title={`Map of ${selected}, San Diego`}
          src={`https://maps.google.com/maps?q=${query}&z=14&output=embed`}
          className="h-[480px] w-full rounded-xl border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
