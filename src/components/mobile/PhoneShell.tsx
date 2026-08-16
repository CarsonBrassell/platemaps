"use client";

import { useSearchParams } from "next/navigation";
import { PhoneNav, parseNavVariant } from "@/components/mobile/PhoneNav";

/**
 * The frame every /m screen sits in: the nav, the space reserved for it, and
 * the desktop phone-column framing (see phone.css).
 *
 * A client component because the nav variant travels in `?nav=` and a layout
 * does not receive `searchParams` — only pages do. Reading it here keeps the
 * switch in one place instead of threading a prop through every screen, and it
 * is the only reason this is not a plain server component. When the variant
 * comparison is over and one nav wins, this collapses back to a server
 * component that renders `<PhoneNav />` with no argument.
 *
 * `data-nav` is what phone.css reads to size `--phone-nav-space`, because the
 * three navs are three different heights and the content has to clear whichever
 * one is on screen.
 */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  const variant = parseNavVariant(useSearchParams().get("nav") ?? undefined);

  return (
    <div className="pm-phone-shell" data-nav={variant}>
      <div className="pm-phone-content">{children}</div>
      <PhoneNav variant={variant} />
    </div>
  );
}
