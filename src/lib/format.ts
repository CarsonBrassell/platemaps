/**
 * A menu price for display — `$14`, `$8.50`. The two sources disagree on
 * shape: the seed menus in `data/dishes.ts` already carry a `$` and two
 * decimals ("$8.00"), while the ~24,800 real dishes `menus:load` put in
 * Postgres are bare numeric strings ("14", "8.5"). Stripping any existing `$`
 * before parsing lets one function own both — cents are shown only when they
 * are not zero, so a whole-dollar price never carries a trailing ".00".
 *
 * `raw` is typed as `string` on `Dish`, but `rowToDish` (lib/db.ts) copies the
 * `price` column straight through with no `?? undefined`, and that column is
 * nullable — a menu row `menus:load` extracted with no listed price (a
 * "market price" item, or a miss) comes back as `null` at runtime despite the
 * type's promise. Calling `.replace` on that null is exactly the kind of
 * crash that surfaces as a 500 on one specific restaurant/dish and nowhere
 * else, so every caller is treated as untrusted here rather than only the
 * ones a future caller remembers to guard.
 */
export function formatPrice(raw: string | null | undefined): string {
  if (raw == null) return "";
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return raw;
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return `$${hasCents ? n.toFixed(2) : n.toFixed(0)}`;
}

/**
 * A sibling-location address for the "Other locations" strip — `street, city`.
 * The `address` column is whatever the source that first found that branch
 * wrote: OpenStreetMap rows often carry a trailing ", USA", Yelp/Google rows
 * carry the full "street, city, state zip". Keeping only the first two
 * comma-separated parts and dropping a bare country suffix gives every row in
 * the strip the same shape instead of whichever source happened to answer.
 */
export function formatSiblingAddress(raw: string): string {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^(usa|u\.s\.a\.?|united states)$/i.test(p));
  return parts.slice(0, 2).join(", ");
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/* Warm, muted tones from the cream family — enough variation to tell people
   apart at a glance without breaking the one-accent palette. */
const AVATAR_PALETTE = [
  { avatarBg: "bg-[#8a7d64]", border: "border-zinc-200" },
  { avatarBg: "bg-[#9c8065]", border: "border-zinc-200" },
  { avatarBg: "bg-[#7d8a6e]", border: "border-zinc-200" },
  { avatarBg: "bg-[#6e838a]", border: "border-zinc-200" },
  { avatarBg: "bg-[#a08457]", border: "border-zinc-200" },
  { avatarBg: "bg-[#877867]", border: "border-zinc-200" },
];

export function avatarPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The day something was written — `Aug 12`, or `Aug 12 '24` once the year
 * stops being this one.
 *
 * `relativeTime` above answers a different question, and answers it badly past
 * a couple of weeks: "324d ago" is a number the reader has to do arithmetic on
 * before it means a date. A feed wants the relative form because everything on
 * it is recent by construction; a profile is an archive, so its plates carry
 * the day they were posted.
 *
 * Assembled from the month table rather than `toLocaleDateString` so the
 * string is identical wherever it is built. The locale formatter is not — it
 * follows the runtime's locale, which is the server's on a prerender and the
 * reader's in the browser, and the two disagreeing is a hydration mismatch
 * that only shows up for readers outside en-US.
 */
export function postedDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear()
    ? day
    : `${day} '${String(d.getFullYear()).slice(2)}`;
}
