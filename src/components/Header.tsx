"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

const NAV_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/map", label: "Map" },
  { href: "/account", label: "My account" },
];

export function Header() {
  const pathname = usePathname();
  const { account, isSignedIn } = useAuth();

  return (
    <header className="flex items-center justify-between gap-4 bg-pm-charcoal px-5 py-3.5">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-base font-medium text-white">
          PlateMap
        </Link>
        <div className="hidden items-center gap-2 rounded-lg bg-pm-charcoal-light px-3 py-1.5 transition-colors focus-within:ring-1 focus-within:ring-pm-orange sm:flex">
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
                ? "inline-block border-b-2 border-pm-orange pb-1 font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 hover:scale-110 active:scale-95"
                : "inline-block border-b-2 border-transparent pb-1 text-white/65 transition-all duration-200 hover:-translate-y-0.5 hover:scale-110 hover:text-white active:scale-95"
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
        {isSignedIn && account?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
            {isSignedIn && account ? initials(account.name) : "?"}
          </div>
        )}
      </div>
    </header>
  );
}
