import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one white card on the cream ground that the three signed-out account
 * pages are drawn in — confirm your email, forgot your password, set a new one.
 *
 * All three are the same object: a mono section label, a Fraunces line saying
 * what happened or what is being asked, a sentence of prose, and at most one
 * thing to do. They were written separately first and drifted within an hour —
 * two different card widths and two different paddings — which is the usual
 * argument for one component rather than three near-copies.
 *
 * No border and no shadow, per DESIGN.md: this card is white on cream and that
 * is the whole grouping device.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/** The card's own action, which is always the primary one on the page. */
export const noticeButton = `min-h-11 w-full rounded-full bg-pm-orange px-5 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-60 ${FOCUS}`;

/** 16px on the value, or iOS zooms the page on focus and never zooms back. */
export const noticeInput = `min-h-11 w-full rounded-xl bg-pm-grey-tint/60 px-3.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange disabled:opacity-60`;

export function NoticeCard({
  label,
  title,
  body,
  action,
  children,
}: {
  label: string;
  title: string;
  body?: ReactNode;
  /** A link out. Forms go in `children` instead. */
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="rounded-2xl bg-white px-6 py-8">
        <p className="mono-label mb-3 text-zinc-500">{label}</p>
        <h1 className="mb-2 font-display text-xl font-semibold text-zinc-900">{title}</h1>
        {body && <p className="text-sm leading-relaxed text-zinc-500">{body}</p>}
        {children && <div className="mt-5">{children}</div>}
        {action && (
          <Link
            href={action.href}
            className={`mt-5 inline-flex items-center justify-center ${noticeButton}`}
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
