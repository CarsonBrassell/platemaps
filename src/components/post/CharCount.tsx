"use client";

import { MAX_POST_TEXT, POST_TEXT_WARN_AT } from "@/lib/postLimits";

/**
 * `137/200` beside a composer's label.
 *
 * Shared by both composers rather than written twice, so the number a person
 * is typing against cannot disagree between the web and the phone — the two
 * pages duplicate almost everything else on purpose, but not this.
 *
 * A count is a machine value, so mono and `tabular-nums` (DESIGN.md): without
 * the tabular figures the whole label shifts left and right as you type, which
 * is exactly the thing you are looking at while typing.
 *
 * It goes quiet-to-orange in the last `POST_TEXT_WARN_AT` characters and never
 * red — nothing here is an error. The textarea's own `maxLength` is what
 * actually stops the typing; this only says how much room is left.
 */
export function CharCount({ value }: { value: string }) {
  const used = value.length;
  const warning = MAX_POST_TEXT - used <= POST_TEXT_WARN_AT;

  return (
    <span
      /* Announced only when it starts mattering. A live region that reads out
         every keystroke's count is unusable with a screen reader on. */
      role={warning ? "status" : undefined}
      className={`font-mono text-[11px] tabular-nums ${
        warning ? "text-pm-orange-text" : "text-zinc-400"
      }`}
    >
      {used}/{MAX_POST_TEXT}
    </span>
  );
}
