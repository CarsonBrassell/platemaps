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
      className={`shrink-0 text-pm-orange-text transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function TrendingIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="shrink-0 text-pm-orange-text"
      aria-hidden="true"
    >
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  );
}

const listItem = (selected: boolean) =>
  selected
    ? "rounded-md bg-pm-orange-tint px-2 py-1.5 text-sm font-medium text-pm-orange-text transition-transform active:scale-[0.97]"
    : "rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-all hover:bg-pm-orange-tint/60 hover:text-pm-orange-text active:scale-[0.97]";

export function Sidebar() {
  const [cuisineOpen, setCuisineOpen] = useState(false);
  const [affordableOpen, setAffordableOpen] = useState(false);
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);

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

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Cuisine</p>
      <button
        onClick={() => setCuisineOpen((open) => !open)}
        className="mb-1 flex w-full items-center justify-between rounded-lg border border-pm-orange-border bg-white px-3 py-2 text-sm font-medium text-zinc-600 shadow-sm transition-all hover:bg-pm-orange-tint/40 active:scale-[0.97]"
      >
        <span>{selectedCuisine ?? "All cuisines"}</span>
        <Chevron open={cuisineOpen} />
      </button>
      {cuisineOpen && (
        <div className="mb-4 mt-1 flex flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
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
      {!cuisineOpen && <div className="mb-3" />}

      <button
        onClick={() => setTrendingOpen((open) => !open)}
        className="mb-2 flex w-full items-center justify-between text-sm font-bold text-pm-orange-text transition-transform active:scale-[0.97]"
      >
        Trending
        <Chevron open={trendingOpen} />
      </button>
      {trendingOpen && (
        <div className="mb-4 flex flex-col gap-2">
          {trending.map((name) => (
            <div
              key={name}
              className="trending-glow flex cursor-pointer items-center gap-2 rounded-lg border-2 border-pm-orange bg-white px-3 py-2 text-sm font-medium text-pm-orange-text transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
            >
              <TrendingIcon />
              {name}
            </div>
          ))}
        </div>
      )}
      {!trendingOpen && <div className="mb-2" />}

      <p className="mb-2 text-sm font-bold text-pm-orange-text">Quick filters</p>
      <div className="flex flex-col gap-0.5">
        <span className={listItem(false)}>Breakfast/lunch</span>
        <span className={listItem(false)}>Dinner</span>
        <span className={listItem(false)}>Dessert</span>

        <button
          onClick={() => setAffordableOpen((open) => !open)}
          className={`flex items-center justify-between text-left ${listItem(false)}`}
        >
          Affordable
          <Chevron open={affordableOpen} />
        </button>
        {affordableOpen && (
          <div className="ml-2 flex flex-col gap-0.5 border-l border-pm-orange-border pl-2">
            {priceRanges.map((price) => (
              <span key={price} className={listItem(false)}>
                {price}
              </span>
            ))}
          </div>
        )}

        <span className={listItem(false)}>Date night</span>
      </div>
    </aside>
  );
}
