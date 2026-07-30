export function StatsBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-pm-orange px-5 py-2.5">
      <span className="text-sm font-medium text-white">
        142 spots open right now
      </span>
      <span className="text-sm text-white/90">18 with no wait</span>
      <span className="text-sm text-white/90">6 closing soon</span>
    </div>
  );
}
