"use client";

import { useState } from "react";

/* Local mirror of the fields the page passes in (db.ts is server-only). */
export type SamplePost = {
  id: string;
  dish: string;
  prose: string;
  score: string | null;
  author: string;
  restaurant: string;
  votes: number;
  photo: string | null;
};

/* Same palette RestaurantMap.tsx uses for the real bubbles. */
const FILL = "#faf7f2";
const INK = "#2b211c";
const MUTED = "#776B5B";
const EDGE = "rgba(43,33,28,0.16)";
const POP = "#A8481A";
const LEADER = "#ffb07a";

type Mode = "A" | "B" | "C";

const OPTIONS: { mode: Mode; name: string; how: string }[] = [
  {
    mode: "A",
    name: "A — Tap again to enlarge",
    how: "Same as today: a sliver peeks out, the arrow slides the photo out beside the text. Tapping that photo a second time opens it full screen.",
  },
  {
    mode: "B",
    name: "B — Photos instead of text",
    how: "A post with a photo shows as a photo tile with its score. Tap for full screen with the words. Posts without a photo stay as text.",
  },
  {
    mode: "C",
    name: "C — Photos already out",
    how: "No arrow, no sliver: every photo sits next to its text from the start. Tap the photo to enlarge it full screen.",
  },
];

/* Where each bubble hangs on the fake map, per panel. */
const SPOTS = [
  { left: 70, top: 70 },
  { left: 150, top: 205 },
  { left: 60, top: 335 },
  { left: 175, top: 455 },
];

export function MapPhotoOptions({ samples }: { samples: SamplePost[] }) {
  const [big, setBig] = useState<SamplePost | null>(null);

  return (
    <div className="min-h-screen bg-[#F7F4EC] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <p className="mono-label text-pm-orange-text">Draft surface</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-zinc-900">
          Map photos, three options
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-pm-grey-text">
          Real posts from the feed. Every bubble is clickable — try each panel.
        </p>
        {samples.length === 0 && (
          <p className="mt-4 text-sm text-pm-grey-text">No public posts with photos found.</p>
        )}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {OPTIONS.map((o) => (
            <section key={o.mode}>
              <h2 className="font-display text-xl font-semibold text-zinc-900">{o.name}</h2>
              <p className="mt-1 min-h-[60px] text-sm text-pm-grey-text">{o.how}</p>
              <FakeMap mode={o.mode} samples={samples} onEnlarge={setBig} />
            </section>
          ))}
        </div>
      </div>
      {big && <Lightbox post={big} onClose={() => setBig(null)} />}
    </div>
  );
}

function FakeMap({
  mode,
  samples,
  onEnlarge,
}: {
  mode: Mode;
  samples: SamplePost[];
  onEnlarge: (p: SamplePost) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div
      className="relative mt-3 h-[600px] overflow-hidden rounded-2xl"
      style={{
        background:
          "linear-gradient(115deg, transparent 48%, #2a2522 48.4%, #2a2522 49.6%, transparent 50%), linear-gradient(20deg, transparent 30%, #262220 30.3%, #262220 31.2%, transparent 31.5%), linear-gradient(160deg, transparent 70%, #262220 70.3%, #262220 71%, transparent 71.3%), #16181c",
      }}
      onClick={() => setOpen(null)}
    >
      {samples.map((p, i) => {
        const spot = SPOTS[i % SPOTS.length];
        const isOpen = open === p.id;
        return (
          <div
            key={p.id}
            className="absolute"
            style={{ left: spot.left, top: spot.top, zIndex: isOpen ? 10 : 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "B" && p.photo ? (
              <PhotoTile post={p} onEnlarge={onEnlarge} />
            ) : (
              <TextBubble
                post={p}
                mode={mode}
                open={isOpen}
                onToggle={() => setOpen(isOpen ? null : p.id)}
                onEnlarge={onEnlarge}
              />
            )}
            <Leader />
          </div>
        );
      })}
    </div>
  );
}

function Leader() {
  return (
    <svg width="40" height="40" className="pointer-events-none absolute left-2 top-full" aria-hidden>
      <path d="M6,0 L6,26 L22,36" fill="none" stroke={LEADER} strokeWidth="1" />
      <circle cx="24" cy="37" r="3.5" fill="#ff8a3d" style={{ filter: "blur(1px)" }} />
    </svg>
  );
}

function Meta({ post }: { post: SamplePost }) {
  return (
    <div
      className="mt-[5px] flex gap-1 whitespace-nowrap font-mono text-[11.5px] leading-[1.5]"
      style={{ color: MUTED }}
    >
      <span>@{post.author.toUpperCase()}</span>
      <span>·</span>
      <span>▲ {post.votes}</span>
    </div>
  );
}

function TextBubble({
  post,
  mode,
  open,
  onToggle,
  onEnlarge,
}: {
  post: SamplePost;
  mode: Mode;
  open: boolean;
  onToggle: () => void;
  onEnlarge: (p: SamplePost) => void;
}) {
  const photoOut = post.photo && (mode === "C" || (mode === "A" && open));
  const sliver = post.photo && mode === "A" && !open;
  return (
    <div className="relative flex cursor-pointer items-stretch" onClick={onToggle}>
      {sliver && (
        <>
          <button
            type="button"
            aria-label="Show photo"
            className="absolute right-[calc(100%+10px)] top-1/2 -mt-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a3a9b2" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.7))" }}>
              <path d="M15 4 L7 12 L15 20" />
            </svg>
          </button>
          <span
            className="absolute bottom-[6px] right-[calc(100%-3px)] top-[6px] w-4 rounded-l-[5px]"
            style={{
              backgroundImage: `url("${post.photo}")`,
              backgroundSize: "140px auto",
              backgroundPosition: "45% 50%",
              boxShadow: "-2px 2px 6px rgba(0,0,0,.45)",
            }}
          />
        </>
      )}
      {photoOut && (
        <button
          type="button"
          aria-label="Enlarge photo"
          className="group relative w-[92px] shrink-0 overflow-hidden rounded-l-[8px]"
          style={{ backgroundImage: `url("${post.photo}")`, backgroundSize: "cover", backgroundPosition: "center" }}
          onClick={(e) => {
            e.stopPropagation();
            onEnlarge(post);
          }}
        >
          <span className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/55">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
            </svg>
          </span>
        </button>
      )}
      <div
        className="box-border"
        style={{
          maxWidth: open ? 250 : 210,
          background: FILL,
          border: `1px solid ${EDGE}`,
          borderRadius: photoOut ? "0 8px 8px 0" : 8,
          borderLeftColor: photoOut ? "transparent" : EDGE,
          padding: "7px 13px",
          fontSize: 14,
          lineHeight: 1.35,
          color: INK,
        }}
      >
        <div className="flex items-baseline justify-between gap-[10px] font-bold">
          <span className={open ? "" : "line-clamp-2"}>
            <span className="font-display">{post.dish}</span>{" "}
            <span className="font-normal">{post.prose}</span>
          </span>
          {post.score && (
            <span className="shrink-0 font-mono" style={{ color: POP }}>
              {post.score}
            </span>
          )}
        </div>
        <Meta post={post} />
      </div>
    </div>
  );
}

function PhotoTile({ post, onEnlarge }: { post: SamplePost; onEnlarge: (p: SamplePost) => void }) {
  return (
    <button
      type="button"
      aria-label={`Open photo of ${post.dish}`}
      className="relative block h-[104px] w-[104px] overflow-hidden rounded-[8px]"
      style={{
        backgroundImage: `url("${post.photo}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        border: `2px solid ${FILL}`,
      }}
      onClick={() => onEnlarge(post)}
    >
      {post.score && (
        <span
          className="absolute bottom-1 right-1 rounded-full px-[7px] py-[1px] font-mono text-[11.5px] font-bold"
          style={{ background: FILL, color: POP }}
        >
          {post.score}
        </span>
      )}
    </button>
  );
}

function Lightbox({ post, onClose }: { post: SamplePost; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Photo"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.photo ?? ""} alt={post.dish} className="max-h-[72vh] max-w-full rounded-[8px] object-contain" />
      <div
        className="mt-3 w-full max-w-md rounded-[8px] px-4 py-3"
        style={{ background: FILL, color: INK }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-lg font-bold">{post.dish}</span>
          {post.score && (
            <span className="font-mono font-bold" style={{ color: POP }}>
              {post.score}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm">{post.prose}</p>
        <Meta post={post} />
      </div>
      <p className="mt-3 font-mono text-xs text-white/60">tap anywhere to close</p>
    </div>
  );
}
