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
