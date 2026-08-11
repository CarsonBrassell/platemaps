"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronIcon, CloseIcon } from "@/components/icons";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Variant =
  /** Centred card on every breakpoint. */
  | "modal"
  /** Centred on desktop, full-width bottom sheet under sm. */
  | "sheet"
  /** Right-hand side panel on desktop, bottom sheet under sm. */
  | "panel"
  /**
   * The whole viewport, at every breakpoint — a destination rather than an
   * overlay on one. Cream ground like a page, not a white card, so the cards
   * inside it read as cards (the same reason the dish sheet is cream).
   */
  | "screen";

const PANEL_CLASS: Record<Variant, string> = {
  modal:
    "w-full max-w-lg rounded-2xl bg-white animate-dialog-in max-h-[90dvh] flex flex-col",
  sheet:
    "w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-white animate-sheet-in sm:animate-dialog-in max-h-[92dvh] flex flex-col",
  panel:
    "w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white animate-sheet-in sm:animate-dialog-in max-h-[85dvh] sm:max-h-[80dvh] flex flex-col",
  screen: "h-dvh w-full bg-[#F7F4EC] animate-sheet-in flex flex-col",
};

const WRAP_CLASS: Record<Variant, string> = {
  modal: "items-center justify-center p-4",
  sheet: "items-end justify-center sm:items-center sm:p-4",
  panel: "items-end justify-center sm:items-center sm:justify-end sm:p-4",
  screen: "items-stretch justify-center",
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
  headerAside,
  headerBelow,
}: {
  title: string;
  onClose: () => void;
  variant?: Variant;
  footer?: ReactNode;
  children: ReactNode;
  labelledBy?: string;
  /** Sits between the title and the close control — a sort switch, a count. */
  headerAside?: ReactNode;
  /** A second header row under the title, inside the same sticky band. */
  headerBelow?: ReactNode;
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
        {/* A screen is left with a back arrow, the way a pushed page is; an
            overlay is dismissed with an X on the right. Same button, opposite
            ends, because they mean different things — one goes back to where
            you were, the other closes something on top of it. */}
        <div
          className={`shrink-0 border-b px-5 py-3 ${
            variant === "screen"
              ? "border-zinc-200/70 bg-[#F7F4EC]/95 backdrop-blur-sm"
              : "border-zinc-100"
          }`}
        >
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
            {variant === "screen" && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Back from ${title}`}
                className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-pm-grey-tint hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <ChevronIcon className="h-5 w-5 rotate-180" />
              </button>
            )}

            <h2
              id={headingId}
              className="min-w-0 flex-1 truncate font-display text-base font-semibold text-zinc-900"
            >
              {title}
            </h2>

            {headerAside}

            {variant !== "screen" && (
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {headerBelow && <div className="mx-auto w-full max-w-2xl">{headerBelow}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div
            className={`shrink-0 border-t px-5 py-3 ${
              variant === "screen"
                ? "border-zinc-200/70 bg-[#F7F4EC] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "border-zinc-100 bg-white"
            }`}
          >
            <div className="mx-auto w-full max-w-2xl">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
