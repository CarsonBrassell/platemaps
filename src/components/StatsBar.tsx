export function StatsBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-black/5 bg-pm-orange-tint px-5 py-2.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-pm-orange-text">
        <span className="h-1.5 w-1.5 rounded-full bg-pm-orange" aria-hidden="true" />
        142 spots open right now
      </span>
      <span className="flex items-center gap-1.5 text-sm text-pm-orange-text">
        <span className="h-1.5 w-1.5 rounded-full bg-pm-orange/50" aria-hidden="true" />
        18 with no wait
      </span>
      <span className="flex items-center gap-1.5 text-sm text-pm-orange-text">
        <span className="h-1.5 w-1.5 rounded-full bg-pm-orange/50" aria-hidden="true" />
        6 closing soon
      </span>
    </div>
  );
}
