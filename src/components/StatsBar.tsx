export function StatsBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-black/5 bg-pm-orange-tint px-5 py-2.5">
      <span className="text-sm font-medium text-pm-orange-text">
        142 spots open right now
      </span>
      <span className="text-sm text-pm-orange-text">18 with no wait</span>
      <span className="text-sm text-pm-orange-text">6 closing soon</span>
    </div>
  );
}
