"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";

/**
 * The settings ledger — the shared shell every settings group on /account and
 * /m/account is drawn in, on both bodies.
 *
 * The idea it replaces: four tinted panels, each control carrying two lines of
 * always-open explanation and reporting its state only through the position of
 * a knob. Six settings read as a wall of prose, and answering "what is my
 * account actually set to" meant reading all of it.
 *
 * Here every row states its own answer in the machine voice on the right, so a
 * section is read down its values like a receipt. The explanation and the
 * control live inside the row and appear when you open it — the words are still
 * there for the one setting you came to change, and absent for the five you
 * didn't.
 *
 * **Grouping is white-on-tan, not an outline.** The section is a tan field and
 * each row a white tile with 2px of that field showing between them. DESIGN.md
 * bans borders and hairlines; what separates these rows is ground, the same
 * device the whole app groups with, just at row scale. Do not "tidy" the seams
 * into a divider.
 *
 * Note the inversion: on /account these sit inside the profile's white card, so
 * the field is tan and the tiles are white. That is the same figure/ground
 * relationship the page uses at large scale, not a second treatment.
 */

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

/**
 * Phone rows want a 16px control font (iOS zooms the viewport for anything
 * smaller and never zooms back) and full-width stacked actions; web rows want
 * the tighter type the rest of that page is set in. Nothing else differs, which
 * is why this is a variant rather than two components.
 */
export type LedgerVariant = "web" | "phone";

/** One tan field under a mono section label. */
export function LedgerSection({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-6 ${className}`}>
      <p className="mono-label mb-2 text-zinc-500">{label}</p>
      <div className="space-y-0.5 rounded-2xl bg-pm-grey-tint/50 p-1.5">{children}</div>
    </section>
  );
}

/**
 * Tracks which row of a section is open. One at a time: two open rows put two
 * paragraphs on screen at once, which is the thing this layout exists to stop.
 */
export function useLedgerRows() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return {
    isOpen: (key: string) => openKey === key,
    toggle: (key: string) => setOpenKey((current) => (current === key ? null : key)),
  };
}

/**
 * One row: label, its current answer, and a control that appears when opened.
 *
 * `state` is the machine voice — mono, tabular, and **not** uppercased. The
 * `.mono-label` treatment is for section labels; these are values, and a
 * username or a restaurant name has to survive being printed. Values that are
 * proper names set here rather than in Fraunces for the same reason the feed
 * card's byline does: this is a compact reference to a record, not a title.
 *
 * A row with no `children` is a plain action (Download my data) and renders as
 * a link or button supplied by the caller instead of a disclosure.
 */
export function LedgerRow({
  label,
  state,
  stateTone = "muted",
  description,
  variant = "web",
  open,
  onToggle,
  children,
}: {
  label: string;
  /** The row's current answer. Omit for rows that are an action, not a setting. */
  state?: string;
  /**
   * `"alert"` for a value that is a problem rather than a preference — an
   * unconfirmed email, and so far nothing else.
   *
   * Red, not orange: DESIGN.md reserves the accent for percentages, selected
   * states and the primary action, and a warning is none of those. `red-700`
   * is the colour every error line in the app already sets in, so this borrows
   * an existing meaning rather than inventing a fourth one.
   */
  stateTone?: "muted" | "alert";
  description?: ReactNode;
  variant?: LedgerVariant;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();

  return (
    <div className="rounded-[10px] bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3.5 py-2.5 text-left ${FOCUS}`}
      >
        <span
          className={`font-medium text-zinc-800 ${variant === "phone" ? "text-[15px]" : "text-sm"}`}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {state && (
            <span
              className={`font-mono text-[11px] tracking-[0.04em] tabular-nums ${
                stateTone === "alert" ? "text-red-700" : "text-zinc-500"
              }`}
            >
              {state}
            </span>
          )}
          <ChevronIcon
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform motion-reduce:transition-none ${
              open ? "rotate-90" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-3.5 pb-3.5">
          {description && (
            <p
              className={`mb-3 leading-snug text-zinc-500 ${
                variant === "phone" ? "text-[13px]" : "text-xs"
              }`}
            >
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/** A row that only does something — no state to report, no panel to open. */
export function LedgerActionRow({
  label,
  description,
  action,
  variant = "web",
}: {
  label: string;
  description?: ReactNode;
  action: ReactNode;
  variant?: LedgerVariant;
}) {
  return (
    <div className="rounded-[10px] bg-white px-3.5 py-3">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <span
          className={`font-medium text-zinc-800 ${variant === "phone" ? "text-[15px]" : "text-sm"}`}
        >
          {label}
        </span>
        {variant === "web" && <span className="shrink-0">{action}</span>}
      </div>
      {description && (
        <p
          className={`mt-1 leading-snug text-zinc-500 ${
            variant === "phone" ? "text-[13px]" : "text-xs"
          }`}
        >
          {description}
        </p>
      )}
      {variant === "phone" && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

/**
 * The control inside an open row: a rank-3 local switch, which DESIGN.md
 * specifies as a segmented tan track with a white selected segment.
 *
 * This is what the web page's iOS-style knob becomes. That knob was the odd one
 * out in the system — the only control of its kind in the app — and it could
 * only ever say on or off, where a named pair says *what* on and off are. The
 * phone panel already used this control; both bodies now share it.
 */
export function LedgerChoice<T extends string | boolean>({
  label,
  options,
  value,
  disabled,
  variant = "web",
  onPick,
}: {
  /** Names the group for screen readers; the visible label is the row's. */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled: boolean;
  variant?: LedgerVariant;
  onPick: (value: T) => void;
}) {
  const phone = variant === "phone";

  return (
    <div
      role="group"
      aria-label={label}
      /* Content-width on the web. Stretched across the row it was a 700px
         switch, which is the size of a primary action — and this is a rank-3
         local control. The phone keeps it full-width because there the row is
         390px wide and the segments are thumb targets. */
      className={`flex gap-1 rounded-full bg-pm-grey-tint p-1 ${phone ? "" : "w-fit"}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (!selected) onPick(option.value);
            }}
            disabled={disabled}
            className={`mono-label min-h-11 rounded-full transition-colors disabled:opacity-50 motion-reduce:transition-none ${FOCUS} ${
              phone ? "flex-1" : "px-7"
            } ${selected ? "bg-white text-zinc-900" : "text-pm-grey-text"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
