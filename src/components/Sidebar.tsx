import { neighborhoods } from "@/data/restaurants";

export function Sidebar() {
  return (
    <aside className="w-[180px] shrink-0">
      <p className="mb-2 text-xs font-medium text-zinc-500">Neighborhoods</p>
      <div className="mb-4 flex flex-col gap-0.5">
        {neighborhoods.map((n, i) => (
          <span
            key={n}
            className={
              i === 0
                ? "rounded-md bg-pm-grey-tint px-2 py-1.5 text-sm font-medium text-pm-grey-text"
                : "px-2 py-1.5 text-sm text-zinc-500"
            }
          >
            {n}
          </span>
        ))}
      </div>
      <p className="mb-2 text-xs font-medium text-zinc-500">Quick filters</p>
      <div className="flex flex-col gap-0.5">
        <span className="px-2 py-1.5 text-sm text-zinc-500">Open now</span>
        <span className="px-2 py-1.5 text-sm text-zinc-500">No wait</span>
        <span className="px-2 py-1.5 text-sm text-zinc-500">Happy hour</span>
      </div>
    </aside>
  );
}
