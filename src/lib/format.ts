export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_PALETTE = [
  { avatarBg: "bg-teal-500", border: "border-teal-200" },
  { avatarBg: "bg-blue-500", border: "border-blue-200" },
  { avatarBg: "bg-rose-500", border: "border-rose-200" },
  { avatarBg: "bg-purple-500", border: "border-purple-200" },
  { avatarBg: "bg-amber-500", border: "border-amber-200" },
  { avatarBg: "bg-emerald-500", border: "border-emerald-200" },
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
