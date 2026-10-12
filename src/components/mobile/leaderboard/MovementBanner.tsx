import Link from "next/link";
import { CloseIcon } from "@/components/icons";
import { Avatar, Sparks, platesToPass, plates, who } from "./parts";
import type { Seat } from "./types";

function names(list: Seat[]) {
  const n = list.map((s) => who(s));
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/**
 * "Since you were last here": a loud, sparking banner when you climbed past
 * somebody, and a sharper one when somebody climbed past you — with the
 * plates it takes to take the seat back. Only names, never a count.
 */
export function MovementBanner({
  passed,
  passedBy,
  youSeat,
  reduced,
  onDismiss,
}: {
  passed: Seat[];
  passedBy: Seat[];
  youSeat: Seat;
  reduced: boolean;
  onDismiss: () => void;
}) {
  const won = passed.length > 0;
  if (!won && passedBy.length === 0) return null;
  const lead = won ? passed[0] : passedBy[passedBy.length - 1];
  const back = won ? 0 : platesToPass(lead.entry.points - youSeat.entry.points);

  return (
    <div
      role="status"
      className={`lb-banner relative mx-3 mt-3 rounded-2xl p-4 ${
        won ? "bg-pm-orange text-[#F7F4EC]" : "lb-banner-lost bg-pm-charcoal text-[#F7F4EC]"
      }`}
    >
      {won && !reduced && <Sparks count={22} spread={110} delay={250} />}
      <div className="relative flex items-center gap-3">
        <span className="relative flex shrink-0">
          {(won ? passed : passedBy).slice(0, 3).map((s, i) => (
            <Avatar
              key={s.entry.id}
              entry={s.entry}
              size={36}
              className={`ring-2 ${won ? "ring-pm-orange" : "ring-pm-charcoal"} ${i ? "-ml-3" : ""}`}
            />
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#F7F4EC]/80">
            {won ? "Since your last visit" : "While you were away"}
          </p>
          <p className="font-display mt-0.5 text-[19px] font-semibold leading-tight">
            {won ? (
              <>
                You passed {names(passed)}!{" "}
                <span className="lb-arrow-up inline-block" aria-hidden="true">
                  ▲
                </span>
              </>
            ) : (
              <>{names(passedBy)} slipped past you</>
            )}
          </p>
          {!won && (
            <p className="mt-1 text-[13px] leading-snug text-[#F7F4EC]/85">
              {plates(back)} takes it back.{" "}
              <Link
                href="/m/post"
                className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                Post a plate
              </Link>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full text-[#F7F4EC]/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F7F4EC]"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
