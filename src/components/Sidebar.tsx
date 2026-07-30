"use client";

import { useState } from "react";
import { neighborhoods, cuisines } from "@/data/restaurants";

const trending = ["Mariscos German", "Sushi Ota"];
const priceRanges = ["$", "$$", "$$$", "$$$$"];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const listItem = (selected: boolean) =>
  selected
    ? "rounded-md bg-pm-orange-tint px-2 py-1.5 text-sm font-medium text-pm-orange-text"
    : "rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700";

export function Sidebar() {
  const [cuisineOpen, setCuisineOpen] = useState(false);
  const [affordableOpen, setAffordableOpen] = useState(false);
  const [selectedCuisine, setSelectedCuisine] = useState(cuisines[0]);

  return (
    <aside className="w-[180px] shrink-0">
      <p className="mb-2 text-sm font-bold text-pm-orange-text">Neighborhoods</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {neighborhoods.map((n, i) => (
          <span key={n} className={listItem(i === 0)}>
            {n}
          </span>
        ))}
      </div>

      <button
        onClick={() => setCuisineOpen((open) => !open)}
        className="mb-2 flex w-full items-center justify-between text-sm font-bold text-pm-orange-text"
      >
        Cuisine
        <Chevron open={cuisineOpen} />
      </button>
      {!cuisineOpen && (
        <p className="mb-4 rounded-md bg-pm-orange-tint px-2 py-1.5 text-sm font-medium text-pm-orange-text">
          {selectedCuisine}
        </p>
      )}
      {cuisineOpen && (
        <div className="mb-4 flex flex-col gap-0.5">
          {cuisines.map((c) => (
            <button
              key={c}
              onClick={() => {
                setSelectedCuisine(c);
                setCuisineOpen(false);
              }}
              className={`w-full text-left ${listItem(c === selectedCuisine)}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Trending</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {trending.map((name) => (
          <span
            key={name}
            className="rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            {name}
          </span>
        ))}
      </div>

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Quick filters</p>
      <div className="flex flex-col gap-0.5">
        <span className="rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
          Open now
        </span>

        <button
          onClick={() => setAffordableOpen((open) => !open)}
          className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          Affordable
          <Chevron open={affordableOpen} />
        </button>
        {affordableOpen && (
          <div className="ml-2 flex flex-col gap-0.5 border-l border-zinc-200 pl-2">
            {priceRanges.map((price) => (
              <span
                key={price}
                className="rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                {price}
              </span>
            ))}
          </div>
        )}

        <span className="rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
          Date night
        </span>
      </div>
    </aside>
  );
}
