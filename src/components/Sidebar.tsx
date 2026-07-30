"use client";

import { useState } from "react";
import { neighborhoods, cuisines } from "@/data/restaurants";

const trending = ["Mariscos German", "Sushi Ota"];
const priceRanges = ["$", "$$", "$$$", "$$$$"];

export function Sidebar() {
  const [affordableOpen, setAffordableOpen] = useState(false);

  return (
    <aside className="w-[180px] shrink-0">
      <p className="mb-2 text-sm font-bold text-pm-orange-text">Neighborhoods</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {neighborhoods.map((n, i) => (
          <span
            key={n}
            className={
              i === 0
                ? "rounded-md bg-pm-orange-tint px-2 py-1.5 text-sm font-medium text-pm-orange-text"
                : "px-2 py-1.5 text-sm text-zinc-500"
            }
          >
            {n}
          </span>
        ))}
      </div>

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Cuisine</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {cuisines.map((c, i) => (
          <span
            key={c}
            className={
              i === 0
                ? "rounded-md bg-pm-orange-tint px-2 py-1.5 text-sm font-medium text-pm-orange-text"
                : "px-2 py-1.5 text-sm text-zinc-500"
            }
          >
            {c}
          </span>
        ))}
      </div>

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Trending</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {trending.map((name) => (
          <span key={name} className="px-2 py-1.5 text-sm text-zinc-500">
            {name}
          </span>
        ))}
      </div>

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Quick filters</p>
      <div className="flex flex-col gap-0.5">
        <span className="px-2 py-1.5 text-sm text-zinc-500">Open now</span>

        <button
          onClick={() => setAffordableOpen((open) => !open)}
          className="flex items-center justify-between px-2 py-1.5 text-left text-sm text-zinc-500"
        >
          Affordable
          <span className="text-xs text-zinc-400">
            {affordableOpen ? "−" : "+"}
          </span>
        </button>
        {affordableOpen && (
          <div className="ml-2 flex flex-col gap-0.5 border-l border-zinc-200 pl-2">
            {priceRanges.map((price) => (
              <span key={price} className="px-2 py-1 text-sm text-zinc-500">
                {price}
              </span>
            ))}
          </div>
        )}

        <span className="px-2 py-1.5 text-sm text-zinc-500">Date night</span>
      </div>
    </aside>
  );
}
