export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 rounded-t-xl bg-pm-navy px-5 py-3.5">
      <span className="text-base font-medium text-white">PlateMap</span>
      <nav className="hidden items-center gap-5 text-sm sm:flex">
        <span className="text-white">Discover</span>
        <span className="text-white/65">Map</span>
        <span className="text-white/65">Saved</span>
      </nav>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-pm-navy-light px-3 py-1.5 text-sm text-white">
          San Diego, CA
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pm-red text-xs font-medium text-white">
          CB
        </div>
      </div>
    </header>
  );
}
