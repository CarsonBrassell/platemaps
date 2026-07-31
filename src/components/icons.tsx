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
