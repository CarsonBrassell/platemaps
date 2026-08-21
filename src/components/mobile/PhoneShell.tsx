"use client";

import { useSearchParams } from "next/navigation";
import { PhoneNav, parseNavVariant } from "@/components/mobile/PhoneNav";
import { PostFlash } from "@/components/mobile/PostFlash";
import { PhonePointsFly } from "@/components/mobile/PhonePointsFly";

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
 *
 * `PostFlash` hangs here rather than on a screen because publishing spans two
 * routes — the composer raises it, the feed lowers it — and anything rendered
 * by either one would unmount at the navigation in the middle. It is also why
 * it sits *inside* `.pm-phone-shell`: at >=480px that element is transformed,
 * which makes it the containing block for fixed children, so the overlay fills
 * the 390px frame on a desktop and the real viewport on a handset with no
 * breakpoint of its own (see phone.css).
 */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  const variant = parseNavVariant(useSearchParams().get("nav") ?? undefined);

  return (
    <div className="pm-phone-shell" data-nav={variant}>
      <div className="pm-phone-content">{children}</div>
      <PhoneNav variant={variant} />
      <PostFlash />
      <PhonePointsFly />
    </div>
  );
}
