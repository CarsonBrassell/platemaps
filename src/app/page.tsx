"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { StatsBar } from "@/components/StatsBar";
import { DiscoverBrowser } from "@/components/DiscoverBrowser";
import { restaurants } from "@/data/restaurants";
import { useAuth } from "@/lib/auth";
import { SideNav, type NavKey } from "@/components/feed/SideNav";
import { MobileNavigation } from "@/components/feed/MobileNavigation";
import { Dialog } from "@/components/feed/Dialog";
import { Leaderboard } from "@/components/feed/Leaderboard";

export default function Home() {
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const [ranksOpen, setRanksOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/friends")
      .then((res) => res.json())
      .then((data: { incoming?: unknown[] }) => {
        if (!cancelled) setPendingRequestCount(data.incoming?.length ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const navAccount = account
    ? { name: account.name, points: account.points, avatarUrl: account.avatarUrl }
    : null;

  function navigate(key: Extract<NavKey, "home" | "saved" | "leaderboard">) {
    if (key === "leaderboard") {
      setRanksOpen(true);
      return;
    }
    router.push(key === "saved" ? "/feed?view=saved" : "/feed");
  }

  return (
    <div className="app-shell mx-auto my-6 w-full max-w-7xl overflow-hidden rounded-2xl border border-zinc-200/60">
      <Header />
      <StatsBar />

      <div className="flex w-full gap-6 pb-24 lg:pb-0">
        <aside className="hidden w-52 shrink-0 py-6 pl-6 lg:block">
          <SideNav
            activeKey="explore"
            account={navAccount}
            // Derived rather than reset inside the fetch effect above, so a
            // stale count from a previous session can't outlive sign-out.
            pendingRequestCount={isSignedIn ? pendingRequestCount : 0}
            onNavigate={navigate}
            onCreate={() => router.push("/post")}
          />
        </aside>

        {/* Filters sit beside the content rather than below the picks strip, so
            the rail starts level with the top of the page. */}
        <div className="min-w-0 flex-1">
          <DiscoverBrowser restaurants={restaurants} />
        </div>
      </div>

      <MobileNavigation
        activeKey="explore"
        onNavigate={navigate}
        onCreate={() => router.push("/post")}
      />

      {ranksOpen && (
        <Dialog title="Leaderboard" onClose={() => setRanksOpen(false)} variant="panel">
          <div className="p-4">
            <Leaderboard currentUserId={account?.id ?? null} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
