"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/", label: "Discover" },
  { href: "/feed", label: "Feed" },
  { href: "/map", label: "Map" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const menuItem =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-pm-orange-tint/60 hover:text-pm-orange-text";

export function Header() {
  const pathname = usePathname();
  const { account, isSignedIn, signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
                ? "inline-block border-b-2 border-pm-orange pb-1 font-medium text-white transition-transform active:scale-95"
                : "inline-block border-b-2 border-transparent pb-1 text-white/65 transition-all hover:text-white/90 active:scale-95"
            }
          >
            {link.label}
          </Link>
        ))}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setAccountOpen((open) => !open)}
            className={
              accountOpen
                ? "inline-block border-b-2 border-pm-orange pb-1 font-medium text-white transition-transform active:scale-95"
                : "inline-block border-b-2 border-transparent pb-1 text-white/65 transition-all hover:text-white/90 active:scale-95"
            }
          >
            My account
          </button>
          {accountOpen && (
            <div className="absolute right-0 top-full z-10 mt-3 w-52 rounded-lg border border-zinc-200 bg-white p-1 text-left shadow-md">
              {isSignedIn && account ? (
                <>
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-zinc-900">{account.name}</p>
                    <p className="text-xs text-zinc-500">{account.email}</p>
                  </div>
                  <div className="my-1 border-t border-zinc-100" />
                  <Link
                    href="/saved"
                    className={menuItem}
                    onClick={() => setAccountOpen(false)}
                  >
                    Saved
                  </Link>
                  <button
                    onClick={() => {
                      signOut();
                      setAccountOpen(false);
                    }}
                    className={menuItem}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/account/signup"
                    className={menuItem}
                    onClick={() => setAccountOpen(false)}
                  >
                    Create account
                  </Link>
                  <Link
                    href="/account/signin"
                    className={menuItem}
                    onClick={() => setAccountOpen(false)}
                  >
                    Sign in
                  </Link>
                  <div className="my-1 border-t border-zinc-100" />
                  <Link
                    href="/saved"
                    className={menuItem}
                    onClick={() => setAccountOpen(false)}
                  >
                    Saved
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </nav>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-pm-charcoal-light px-3 py-1.5 text-sm text-white">
          San Diego, CA
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pm-orange text-xs font-medium text-white">
          {isSignedIn && account ? initials(account.name) : "?"}
        </div>
      </div>
    </header>
  );
}
