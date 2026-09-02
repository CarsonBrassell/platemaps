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
