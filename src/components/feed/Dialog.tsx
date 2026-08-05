"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Variant =
  /** Centred card on every breakpoint. */
  | "modal"
  /** Centred on desktop, full-width bottom sheet under sm. */
  | "sheet"
  /** Right-hand side panel on desktop, bottom sheet under sm. */
  | "panel";

const PANEL_CLASS: Record<Variant, string> = {
  modal:
    "w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-dialog-in max-h-[90dvh] flex flex-col",
  sheet:
    "w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl animate-sheet-in sm:animate-dialog-in max-h-[92dvh] flex flex-col",
  panel:
    "w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl animate-sheet-in sm:animate-dialog-in max-h-[85dvh] sm:max-h-[80dvh] flex flex-col",
};

const WRAP_CLASS: Record<Variant, string> = {
  modal: "items-center justify-center p-4",
  sheet: "items-end justify-center sm:items-center sm:p-4",
  panel: "items-end justify-center sm:items-center sm:justify-end sm:p-4",
};

/**
 * Shared shell for every overlay in the feed. Owns the behaviour that is easy
 * to get wrong per-component: Escape to close, focus moved in on open and
 * restored on close, Tab cycling kept inside, and background scroll locked.
 */
export function Dialog({
  title,
  onClose,
  variant = "modal",
  footer,
  children,
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  variant?: Variant;
  footer?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const headingId = labelledBy ?? `dialog-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-pm-charcoal/45 backdrop-blur-[2px] animate-fade-in ${WRAP_CLASS[variant]}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={PANEL_CLASS[variant]}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
          <h2 id={headingId} className="font-display text-base font-semibold text-zinc-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-zinc-200 bg-white px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
