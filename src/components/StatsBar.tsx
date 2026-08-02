export function StatsBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-pm-orange-border/40 bg-gradient-to-r from-pm-orange-tint via-pm-orange-tint to-orange-50 px-5 py-2.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-pm-orange-text">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pm-orange/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-pm-orange" />
        </span>
        142 spots open right now
      </span>
      <span className="flex items-center gap-1.5 text-sm text-pm-orange-text/90">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        18 with no wait
      </span>
      <span className="flex items-center gap-1.5 text-sm text-pm-orange-text/90">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.7 3.86a2 2 0 0 0-3.4 0z" />
        </svg>
        6 closing soon
      </span>
    </div>
  );
}
