/**
 * The unread marker on a nav slot. Whether it shows is decided by
 * `useNavAlerts` (src/lib/navAlerts.ts); this file only decides how it looks.
 *
 * A dot rather than a count, in both bodies: the number isn't the point, and a
 * bare integer beside "Friends" reads as a friend count, which this product
 * never displays.
 *
 * `role="status"` with a real label rather than `aria-hidden`, because to a
 * screen reader the dot *is* the whole message — there is no visible text
 * saying what is waiting.
 */
export function NavDot({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`h-1.5 w-1.5 shrink-0 rounded-full bg-pm-red ${className}`}
    />
  );
}
