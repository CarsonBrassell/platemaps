"use client";

import { useEffect, useState } from "react";
import {
  LedgerChoice,
  LedgerRow,
  LedgerSection,
  useLedgerRows,
  type LedgerVariant,
} from "@/components/account/ledger";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cuisines } from "@/data/restaurants";

/**
 * Everything that changes what the app shows about you, on both bodies.
 *
 * This is the merge of what used to be three components: the web page's
 * `ProfileSettingsPanel`, the phone screen's copy of it, and `BlockedUsersPanel`
 * — which only ever existed on the web, so a phone-only user could create a
 * block from a post card and then had no surface anywhere to undo it. Blocked
 * is a row here, which closes that on both bodies at once.
 *
 * One component rather than two: the panels were written twice because the
 * layouts genuinely differed — an iOS knob against a segmented track. In the
 * ledger they are the same rows with the same control, and the only real
 * difference left is type size, which is a variant.
 */
export function SettingsLedger({ variant = "web" }: { variant?: LedgerVariant }) {
  const { account, updateSettings } = useAuth();
  const privacy = useLedgerRows();
  const taste = useLedgerRows();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Only the favourite-restaurant row needs these, and only to name things —
  // the id the server validates against is its own row.
  const [restaurants, setRestaurants] = useState<{ id: string; name: string }[]>([]);

  // Above the `!account` guard, because hooks cannot run conditionally.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Only id and name are read below, so ask for the index projection
        // rather than the full corpus. See getRestaurantIndex in lib/db.ts.
        const res = await fetch("/api/restaurants?fields=index");
        if (!res.ok) return;
        const data: { restaurants: { id: string; name: string }[] } = await res.json();
        if (!cancelled) setRestaurants(data.restaurants);
      } catch {
        // The row falls back to "Not set" only, which is still a valid state —
        // better than blocking the rest of the ledger.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return null;

  /** Every field on this ledger takes the same round trip. */
  async function save(patch: Parameters<typeof updateSettings>[0]) {
    setSaving(true);
    setError("");
    const result = await updateSettings(patch);
    if (result) setError(result);
    setSaving(false);
  }

  const favoriteRestaurant = restaurants.find((r) => r.id === account.favoriteRestaurantId);

  return (
    <>
      <LedgerSection label="Privacy">
        <LedgerRow
          label="Photos on public plates"
          state={account.sharePhotosPublicly ? "Shown" : "Hidden"}
          /* Careful about what this setting actually gates. The plate itself is
             always public — every post reaches the discover feed either way.
             What's private is the photo: `getDiscoverFeed` strips media
             server-side, so the URL never leaves the server. Copy that says
             the post is friends-only is wrong, and reads as a promise the app
             doesn't keep.

             No mention of the snapshot either. `photos_public` is frozen onto
             each post at write time, so a plate posted with this off keeps its
             photos with friends for good — the safe direction, and spelling it
             out read as an apology rather than the guarantee it is. */
          description="When this is on, everyone can see your photos. Off, only friends can."
          variant={variant}
          open={privacy.isOpen("photos")}
          onToggle={() => privacy.toggle("photos")}
        >
          <LedgerChoice
            label="Photos on public plates"
            options={[
              { value: false, label: "Hidden" },
              { value: true, label: "Shown" },
            ]}
            value={account.sharePhotosPublicly}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ sharePhotosPublicly: value })}
          />
        </LedgerRow>

        <LedgerRow
          label="Leaderboard"
          state={account.hideFromLeaderboard ? "Hidden" : "Visible"}
          description="You keep earning points and can still see your own. Hidden just means friends won't see you ranked."
          variant={variant}
          open={privacy.isOpen("leaderboard")}
          onToggle={() => privacy.toggle("leaderboard")}
        >
          <LedgerChoice
            label="Leaderboard"
            options={[
              { value: false, label: "Visible" },
              { value: true, label: "Hidden" },
            ]}
            value={account.hideFromLeaderboard}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ hideFromLeaderboard: value })}
          />
        </LedgerRow>

        <LedgerRow
          label="Find me by username"
          state={account.discoverableByUsername ? "On" : "Off"}
          description="On by default. Turning it off keeps you out of username search — people you're already friends with still see you."
          variant={variant}
          open={privacy.isOpen("discoverable")}
          onToggle={() => privacy.toggle("discoverable")}
        >
          <LedgerChoice
            label="Find me by username"
            options={[
              { value: false, label: "Off" },
              { value: true, label: "On" },
            ]}
            value={account.discoverableByUsername}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ discoverableByUsername: value })}
          />
        </LedgerRow>

        <LedgerRow
          label="Friend requests"
          state={account.friendRequestsOpen ? "Open" : "Closed"}
          description="Closing this stops new requests. It doesn't remove the friends you already have."
          variant={variant}
          open={privacy.isOpen("requests")}
          onToggle={() => privacy.toggle("requests")}
        >
          <LedgerChoice
            label="Friend requests"
            options={[
              { value: false, label: "Closed" },
              { value: true, label: "Open" },
            ]}
            value={account.friendRequestsOpen}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ friendRequestsOpen: value })}
          />
        </LedgerRow>

        <BlockedRow variant={variant} open={privacy.isOpen("blocked")} onToggle={() => privacy.toggle("blocked")} />
      </LedgerSection>

      <LedgerSection label="Taste">
        <LedgerRow
          label="Favorite cuisine"
          state={account.favoriteCuisine ?? "Not set"}
          description="Stored against the same cuisine list Discover filters by, so it can be used for taste matching later."
          variant={variant}
          open={taste.isOpen("cuisine")}
          onToggle={() => taste.toggle("cuisine")}
        >
          <LedgerSelect
            label="Favorite cuisine"
            value={account.favoriteCuisine ?? ""}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ favoriteCuisine: value || null })}
            options={cuisines.map((c) => ({ value: c, label: c }))}
          />
        </LedgerRow>

        <LedgerRow
          label="Favorite restaurant"
          state={favoriteRestaurant?.name ?? "Not set"}
          description="A real restaurant off the map, not free text — same reason as the cuisine above."
          variant={variant}
          open={taste.isOpen("restaurant")}
          onToggle={() => taste.toggle("restaurant")}
        >
          <LedgerSelect
            label="Favorite restaurant"
            value={account.favoriteRestaurantId ?? ""}
            disabled={saving}
            variant={variant}
            onPick={(value) => void save({ favoriteRestaurantId: value || null })}
            options={restaurants.map((r) => ({ value: r.id, label: r.name }))}
          />
        </LedgerRow>
      </LedgerSection>

      {error && (
        <p role="alert" className="-mt-4 mb-6 text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * The two favorites are picks from a long list, which is a native `<select>`
 * and not a segmented track — a rank-3 switch is for a handful of named states,
 * not nineteen cuisines.
 *
 * `text-base` on the phone: iOS zooms the viewport for any control under 16px
 * and never zooms back out.
 */
function LedgerSelect({
  label,
  options,
  value,
  disabled,
  variant,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  disabled: boolean;
  variant: LedgerVariant;
  onPick: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onPick(e.target.value)}
      disabled={disabled}
      className={`min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3 transition-colors focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange disabled:opacity-50 ${
        variant === "phone" ? "text-base" : "text-sm"
      }`}
    >
      <option value="">Not set</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The one place a block is reversible. Post cards and profile pages can create
 * one; this row is the only surface that lists them and lets you undo one.
 *
 * It reports its own count as the row's state, so "am I blocking anybody" is
 * answered without opening it — which is most of why the old panel had to hide
 * itself when the list was empty. This one can say "None" instead of vanishing,
 * and a row that is always present is a row people can find twice.
 */
function BlockedRow({
  variant,
  open,
  onToggle,
}: {
  variant: LedgerVariant;
  open: boolean;
  onToggle: () => void;
}) {
  const { account } = useAuth();
  const [blocked, setBlocked] = useState<{ id: string; name: string; avatarUrl?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    fetch("/api/blocks")
      .then((res) => res.json())
      .then((data: { blocked: { id: string; name: string; avatarUrl?: string }[] }) => {
        setBlocked(data.blocked);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [account]);

  async function handleUnblock(userId: string) {
    setPendingId(userId);
    const previous = blocked;
    setBlocked((b) => b.filter((u) => u.id !== userId));
    try {
      const res = await fetch("/api/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setBlocked(previous);
    }
    setPendingId(null);
  }

  const count = blocked.length;
  const state = !loaded ? "—" : count === 0 ? "None" : count === 1 ? "1 person" : `${count} people`;

  return (
    <LedgerRow
      label="Blocked"
      state={state}
      description={
        count === 0
          ? "Nobody. Blocking someone from a post or their profile hides you from each other; this is where you'd undo it."
          : "They can't see your plates and you can't see theirs. Unblocking takes effect immediately."
      }
      variant={variant}
      open={open}
      onToggle={onToggle}
    >
      {count > 0 && (
        <ul className="space-y-2">
          {blocked.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pm-grey-tint font-mono text-xs font-medium text-pm-grey-text">
                    {initials(u.name)}
                  </span>
                )}
                <span className="truncate text-sm font-medium text-zinc-800">{u.name}</span>
              </div>
              <button
                type="button"
                onClick={() => handleUnblock(u.id)}
                disabled={pendingId === u.id}
                className="min-h-11 shrink-0 rounded-full bg-pm-grey-tint px-4 text-xs font-medium text-zinc-700 transition-colors hover:bg-pm-grey-tint/70 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </LedgerRow>
  );
}
