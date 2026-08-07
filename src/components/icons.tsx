const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.196-1.538-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.98 9.384c-.784-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z";

export function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  );
}

export function UtensilsIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 2v7a2 2 0 0 0 2 2v11" />
      <path d="M7 2v9" />
      <path d="M5 2v9" />
      <path d="M19 2c-1.7 0-3 2-3 4.5S17.3 11 19 11v11" />
    </svg>
  );
}

export function BookmarkIcon({
  filled = false,
  className = "",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 3a2 2 0 0 0-2 2v16l8-4.5 8 4.5V5a2 2 0 0 0-2-2H6z" />
    </svg>
  );
}

export function MoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function PlateStarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <line x1="1.6" y1="3" x2="1.6" y2="9" />
        <line x1="3" y1="3" x2="3" y2="9" />
        <line x1="4.4" y1="3" x2="4.4" y2="9" />
        <line x1="3" y1="9" x2="3" y2="20" />
      </g>
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M29 3c1.1 1.9 1.1 4.6 0 6.4-.5.8-1.2.8-1.2 0V3" />
        <line x1="29.2" y1="9.4" x2="29.2" y2="20" />
      </g>
      <circle cx="16" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <circle cx="16" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <g transform="translate(10.4 6.4) scale(0.56)">
        <path d={STAR_PATH} fill="currentColor" />
      </g>
    </svg>
  );
}

/* --- Feed icons ------------------------------------------------------- */

type IconProps = { className?: string };

const stroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HeartIcon({ filled = false, className = "" }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} fill={filled ? "currentColor" : "none"} className={className} aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

export function ChatIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

export function ShareIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v14" />
    </svg>
  );
}

export function HomeIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function CompassIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5.2-5.2 2 2-5.2z" />
    </svg>
  );
}

export function TrophyIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5H4.5a2.5 2.5 0 0 0 2.5 5" />
      <path d="M17 5h2.5a2.5 2.5 0 0 1-2.5 5" />
      <path d="M12 14v3" />
      <path d="M8.5 21h7l-.7-3h-5.6z" />
    </svg>
  );
}

export function UserIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function PlusIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function CameraIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function VideoIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 11 6-3.5v9L16 13z" />
    </svg>
  );
}

export function TagIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M3 3h8l10 10-8 8L3 11z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

export function PinIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function PriceIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M12 2v20" />
      <path d="M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" />
    </svg>
  );
}

export function InfoIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </svg>
  );
}

export function ChevronIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function FlagIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M4 21V4" />
      <path d="M4 4h13l-2.5 4L17 12H4z" />
    </svg>
  );
}

export function EyeOffIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.3 3.4" />
      <path d="M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.5 9.5 0 0 0 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function PlayIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

export function WifiOffIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} className={className} aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M6.3 10.3a10 10 0 0 1 3-1.9" />
      <path d="M2.5 7a15 15 0 0 1 4-2.6" />
      <path d="M17.7 10.3A10 10 0 0 0 12 8" />
      <path d="M21.5 7a15 15 0 0 0-6.6-3.4" />
      <path d="M9.5 13.5a5.5 5.5 0 0 1 2.5-1.4" />
      <path d="M12 19h.01" />
    </svg>
  );
}

/**
 * Hand-built flame for trending plates. Two stacked solid paths rather than a
 * gradient, so repeated instances need no duplicated <defs> ids — the glow is
 * a CSS drop-shadow (see .flame-glow) so it can be disabled for reduced motion.
 */
export function FlameIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#e8590c"
        d="M13.1 1.6c.7 3.4-.6 5.3-2.2 6.9-1.9 1.9-4.4 3.7-4.4 7.2a7.5 7.5 0 0 0 15 0c0-2.9-1.2-5-2.6-6.8-.4 1.3-1.2 2.2-2.3 2.7 1-3.6-.4-7.6-3.5-10z"
      />
      <path
        fill="#fbbf24"
        d="M12 22a3.9 3.9 0 0 1-3.9-3.9c0-2 1.4-3.2 2.5-4.5.4 1.1 1.1 1.8 2 2.2-.5-1.8 0-3.6 1.2-5 1.3 1.5 2.1 3.1 2.1 5.2A3.9 3.9 0 0 1 12 22z"
      />
    </svg>
  );
}

/**
 * Solid-fill thumbs, drawn to sit alongside StarIcon and PlateStarIcon rather
 * than the outlined feed icons — the "would you eat this?" verdict is a
 * headline control, so it gets the weightier treatment.
 */
export function ThumbUpIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 10.5H4.2A2.2 2.2 0 0 0 2 12.7v7.1A2.2 2.2 0 0 0 4.2 22h2.3z" opacity="0.55" />
      <path d="M8.5 10.8 13 2.2a1.7 1.7 0 0 1 3.2.8v5.4h4.1a2.2 2.2 0 0 1 2.15 2.67l-1.62 7.3A2.5 2.5 0 0 1 18.4 22H8.5z" />
    </svg>
  );
}

export function ThumbDownIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 13.5H4.2A2.2 2.2 0 0 1 2 11.3V4.2A2.2 2.2 0 0 1 4.2 2h2.3z" opacity="0.55" />
      <path d="M8.5 13.2 13 21.8a1.7 1.7 0 0 0 3.2-.8v-5.4h4.1a2.2 2.2 0 0 0 2.15-2.67l-1.62-7.3A2.5 2.5 0 0 0 18.4 2H8.5z" />
    </svg>
  );
}

export function ChefHatIcon({ className = "" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.6 10.4A4.3 4.3 0 0 1 8 2.05a4.6 4.6 0 0 1 8 0 4.3 4.3 0 0 1 1.4 8.35V14H6.6z" />
      <path d="M6.6 15.6h10.8v3.1a2.3 2.3 0 0 1-2.3 2.3H8.9a2.3 2.3 0 0 1-2.3-2.3z" opacity="0.55" />
    </svg>
  );
}
