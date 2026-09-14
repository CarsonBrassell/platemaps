"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Dialog } from "@/components/feed/Dialog";
import {
  Collage,
  OpenBody,
  WORDS,
  mix,
  openTitle,
  usePhotoPlates,
  type DraftPost,
  type OpenKind,
  type TileKind,
} from "@/components/drafts/ProfileTextPostsDraft";

/**
 * DRAFT (phone) — the profile's "All posts" as the two-column collage, live.
 * Pick a tile treatment and an open treatment with the two switches, then
 * tap any words plate: it opens in the real sheet `Dialog`, on the real
 * phone shell, with the real nav under it. Photo plates are yours from the
 * feed when signed in; the words are sample copy.
 */
const TILES: { kind: TileKind; label: string }[] = [
  { kind: "now", label: "Now" },
  { kind: "clipping", label: "A Clipping" },
  { kind: "slip", label: "B Slip" },
  { kind: "score", label: "C Score" },
];

const OPENS: { kind: OpenKind; label: string }[] = [
  { kind: "now", label: "Now" },
  { kind: "quote", label: "1 Quote" },
  { kind: "tone", label: "2 Tile" },
  { kind: "verdict", label: "3 Verdict" },
];

function Switch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { kind: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="mono-label w-9 shrink-0 text-pm-grey-text">{label}</span>
      <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-pm-grey-tint p-1">
        {options.map((o) => {
          const on = o.kind === value;
          return (
            <button
              key={o.kind}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.kind)}
              className={`flex min-h-8 items-center whitespace-nowrap rounded-full px-3 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                on ? "bg-white text-zinc-900" : "text-pm-grey-text hover:text-zinc-900"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Page() {
  const { account } = useAuth();
  const photos = usePhotoPlates(account);
  const posts = mix(photos, WORDS);
  const [tile, setTile] = useState<TileKind>("clipping");
  const [openKind, setOpenKind] = useState<OpenKind>("tone");
  const [open, setOpen] = useState<DraftPost | null>(null);

  return (
    <div className="px-4 pb-8 pt-4">
      <p className="mono-label text-pm-orange-text">Draft</p>
      <h1 className="font-display text-2xl font-semibold text-zinc-900">Words plates on the profile</h1>
      <p className="mt-1 text-sm text-pm-grey-text">Pick a tile and an open treatment, then tap a words plate.</p>

      <div className="mt-4 flex flex-col gap-2">
        <Switch label="Tile" value={tile} options={TILES} onChange={setTile} />
        <Switch label="Open" value={openKind} options={OPENS} onChange={setOpenKind} />
      </div>

      <div className="mt-6">
        <Collage posts={posts} kind={tile} framed={false} onOpen={setOpen} />
      </div>

      {open && (
        <Dialog
          title={openTitle(openKind, open)}
          onClose={() => setOpen(null)}
          variant="sheet"
          footer={
            <div className="flex items-end gap-2">
              <span className="flex min-h-11 flex-1 items-center rounded-full bg-pm-grey-tint/60 px-4 text-sm text-pm-grey-text">
                Add a comment…
              </span>
              <span className="flex min-h-11 items-center rounded-full bg-pm-orange px-4 text-sm font-medium text-[#F7F4EC] opacity-40">
                Post
              </span>
            </div>
          }
        >
          <OpenBody kind={openKind} post={open} />
        </Dialog>
      )}
    </div>
  );
}
