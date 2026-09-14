"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import {
  Block,
  Collage,
  CurrentGrid,
  OpenBody,
  Sheet,
  WORDS,
  mix,
  openTitle,
  usePhotoPlates,
  type OpenKind,
} from "@/components/drafts/ProfileTextPostsDraft";

/**
 * DRAFT (web view) — every treatment side by side, static, for comparing.
 * The phone view at /m/drafts/profile-text-posts is the one to tap through;
 * the treatments themselves live in `components/drafts/ProfileTextPostsDraft`.
 */
const OPENS: { kind: OpenKind; label: string }[] = [
  { kind: "now", label: "Now" },
  { kind: "quote", label: "1 · Pull quote" },
  { kind: "tone", label: "2 · The tile, grown up" },
  { kind: "verdict", label: "3 · Verdict first" },
];

const TILE_LABELS = ["A · Clipping", "B · Slip", "C · Score-led"];

export default function ProfileTextPostsDraftPage() {
  const { account } = useAuth();
  const photos = usePhotoPlates(account);
  const posts = mix(photos, WORDS);
  const open = WORDS[2];

  return (
    <>
      <Header />
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 sm:px-6">
        <p className="mono-label text-pm-orange-text">Draft · words-only plates on the profile</p>
        <h1 className="font-display text-3xl font-semibold text-zinc-900">
          A post with no photo shows its words
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-pm-grey-text">
          The photo tiles have been tuned; a words-only plate is still a blank beige
          square. Three tile treatments in the two-column collage Discover uses, then
          three answers to what a words plate opens into. Each column is 390px — a
          phone.{" "}
          <Link href="/m/drafts/profile-text-posts" className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500">
            Tap through it on the phone
          </Link>
          .
        </p>

        <div className="mt-10">
          <Block
            letter="Now"
            name="What ships today"
            note="Six-across 76px squares. A words plate is a tone block with nothing on it — the missing-photo stand-in, wearing a score. Nothing says which beige square said what."
          >
            <CurrentGrid posts={posts} />
          </Block>

          <Block
            letter="Tiles"
            name="In the collage"
            note="Two across, packed shortest-first like Discover, so photos keep their proportions and a words tile is as tall as what was said. A — Clipping: words on tone with the Fraunces quote as the one mark, restaurant as caption. B — Slip: white, two lines, mono byline; the smallest and quietest. C — Score-led: the percent in heat first, the note under it."
          >
            <div className="flex flex-wrap items-start gap-6 pb-2">
              {(["clipping", "slip", "score"] as const).map((kind, i) => (
                <div key={kind}>
                  <p className="mb-2 font-mono text-[12px] text-pm-grey-text">{TILE_LABELS[i]}</p>
                  <Collage posts={posts} kind={kind} />
                </div>
              ))}
            </div>
          </Block>

          <Block
            letter="Open"
            name="What a words plate opens into"
            note="The same plate (the Tuetano birria) in the shipped sheet and three redraws. 1 — Pull quote: the words do the photo's job, large, with the quote hanging in the margin. 2 — The tile, grown up: the Clipping's tone block full-width where the photo goes, hearts pinned in its corner exactly as on a photo. 3 — Verdict first: score at feed size beside the name, the words as a note card on a cream well."
          >
            <div className="flex flex-wrap items-start gap-6 pb-2">
              {OPENS.map((o) => (
                <div key={o.kind}>
                  <p className="mb-2 font-mono text-[12px] text-pm-grey-text">{o.label}</p>
                  <Sheet title={openTitle(o.kind, open)}>
                    <OpenBody kind={o.kind} post={open} />
                  </Sheet>
                </div>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </>
  );
}
