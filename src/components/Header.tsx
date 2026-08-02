"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

const NAV_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/account", label: "My account" },
];

export function Header() {
  const pathname = usePathname();
  const { account, isSignedIn } = useAuth();

  return (
    <header className="flex items-center justify-between gap-4 bg-gradient-to-b from-pm-charcoal-light to-pm-charcoal px-5 py-3.5">
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pm-orange text-white shadow-sm shadow-pm-orange/40">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 2v7a2 2 0 0 0 2 2v11" />
              <path d="M7 2v9" />
              <path d="M5 2v9" />
              <path d="M19 2c-1.7 0-3 2-3 4.5S17.3 11 19 11v11" />
            </svg>
          </span>
          PlateMap
        </Link>
        <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-inset ring-white/10 transition-all focus-within:bg-white/[0.14] focus-within:ring-pm-orange/70 sm:flex">
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
        <div className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-inset ring-white/10 sm:flex">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-orange" aria-hidden="true">
            <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          San Diego, CA
        </div>
        {isSignedIn && account?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-white/15 transition-transform hover:scale-105"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white ring-2 ring-white/15 transition-transform hover:scale-105">
            {isSignedIn && account ? initials(account.name) : "?"}
          </div>
        )}
      </div>
    </header>
  );
}
