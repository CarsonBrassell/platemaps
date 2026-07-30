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
      <Link href="/" className="text-base font-medium text-white">
        PlateMap
      </Link>
      <nav className="hidden items-center gap-5 text-sm sm:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "text-white" : "text-white/65"}
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
