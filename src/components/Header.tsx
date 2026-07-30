"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/map", label: "Map" },
  { href: "/saved", label: "Saved" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between gap-4 rounded-t-xl bg-pm-charcoal px-5 py-3.5">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-base font-medium text-white">
          PlateMap
        </Link>
        <div className="hidden items-center gap-2 rounded-lg bg-pm-charcoal-light px-3 py-1.5 sm:flex">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-white/50"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search restaurants..."
            aria-label="Search restaurants"
            className="w-40 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none"
          />
        </div>
      </div>
      <nav className="hidden items-center gap-5 text-sm sm:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href
                ? "font-medium text-pm-orange"
                : "text-white/65"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-pm-charcoal-light px-3 py-1.5 text-sm text-white">
          San Diego, CA
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
          CB
        </div>
      </div>
    </header>
  );
}
