"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { chillRamp, heatFor, heatRamp, isPerfect } from "@/components/post/PercentMeter";

/**
 * DRAFT — six treatments for the profile's plate grid, side by side on the
 * page's real cream ground, drawn from your real plates.
 *
 * It exists because the shipped grid reads as a filmstrip of contact prints:
 * `repeat(auto-fill, minmax(76px,1fr))` lays ~12 tracks across the 936px
 * content column, so six posts sit at their 76px minimum with half the row
 * empty, wearing a 9.5px zinc-500 meta line — the same number the feed card
 * draws at 42px in the heat gradient.
 *
 * Nothing here is wired into the product. Delete the route once a treatment
 * is picked; the winner moves into `ProfileShelves`, which both trees share.
 */

type DraftPost = {
  id: string;
  userId: string;
  text: string;
  restaurant?: string;
  dishName?: string;
  rating?: number;
  ratingKind?: "restaurant" | "dish";
  upvoteCount: number;
  media?: { url: string; type: "image" | "video"; alt?: string }[];
  comments?: { id: string }[];
};

/* The shipped helpers, copied rather than exported out of ProfileShelves —
   a draft route must not widen a shipping component's API. */
const nameOf = (p: DraftPost) => p.dishName ?? p.restaurant ?? p.text;
const pctOf = (p: DraftPost) =>
  p.ratingKind === "dish" && p.rating != null ? Math.round(p.rating) : null;
const metaOf = (p: DraftPost) => {
  const pct = pctOf(p);
  return `▲ ${p.upvoteCount}${pct !== null ? ` · ${pct}%` : ""}`;
};

/** The photo area. These are always your own plates, so the photo shows. */
function Photo({
  post,
  tone,
  className,
}: {
  post: DraftPost;
  tone: number;
  className: string;
}) {
  const photo = post.media?.find((m) => m.type === "image");
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo.url} alt={photo.alt ?? ""} className={`${className} object-cover`} />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center p-2 text-center`}
      style={{ background: `var(--pm-tone-${tone})` }}
    >
      <span className="line-clamp-3 text-[11px] font-medium leading-snug text-zinc-700">
        {post.restaurant ?? post.text}
      </span>
    </div>
  );
}

/**
 * The percent in the feed card's clothes — `.pct-heat` with the tier plus the
 * two continuous ramps, exactly as FoodPostCard sets them. `size` is a
 * Tailwind text class so each variant can spend a different amount on it.
 */
function HeatPercent({ pct, size }: { pct: number; size: string }) {
  return (
    <span
      data-heat={heatFor(pct)}
      style={{ "--heat": heatRamp(pct), "--chill": chillRamp(pct) } as CSSProperties}
      className={`pct-heat font-mono ${size} font-bold leading-none tabular-nums ${
        isPerfect(pct) ? "pct-shine" : ""
      }`}
    >
      {pct}%
    </span>
  );
}

/** The white-pill-on-the-photo from DESIGN.md's grid card spec. */
function Pill({ post }: { post: DraftPost }) {
  const pct = pctOf(post);
  return (
    <span className="absolute bottom-1.5 left-1.5 right-1.5 inline-flex items-center gap-1.5 truncate rounded-full bg-white px-2 py-1">
      {pct !== null && (
        <span className="font-mono text-[12px] font-bold tabular-nums text-pm-orange-text">
          {pct}%
        </span>
      )}
      {pct !== null && <span aria-hidden="true" className="text-zinc-300">·</span>}
      <span className="font-mono text-[11px] tabular-nums text-zinc-600">
        ▲ {post.upvoteCount}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The variants                                                        */
/* ------------------------------------------------------------------ */

/** WHAT SHIPS TODAY. 76px tracks, meta line in 9.5px zinc-500, no name. */
function Current({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
      {posts.map((post, i) => (
        <div key={post.id} className="rounded-xl bg-white p-1.5 pb-1.5 text-left">
          <Photo post={post} tone={((i + 2) % 3) + 1} className="block aspect-square w-full rounded-lg" />
          <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-zinc-500">
            {metaOf(post)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A — the grid math alone. `auto-fit` + a 150px floor. Nothing else changes. */
function VariantA({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      {posts.map((post, i) => (
        <div key={post.id} className="rounded-xl bg-white p-1.5 pb-1.5 text-left">
          <Photo post={post} tone={((i + 2) % 3) + 1} className="block aspect-square w-full rounded-lg" />
          <span className="mt-1 block font-mono text-[9.5px] tabular-nums text-zinc-500">
            {metaOf(post)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** B — A, plus the numbers move onto the photo as the house pill. No frame. */
function VariantB({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      {posts.map((post, i) => (
        <div key={post.id} className="relative">
          <Photo post={post} tone={((i + 2) % 3) + 1} className="block aspect-square w-full rounded-xl" />
          <Pill post={post} />
        </div>
      ))}
    </div>
  );
}

/** C — A, plus the feed's heat percent under the photo and the dish's name. */
function VariantC({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      {posts.map((post, i) => {
        const pct = pctOf(post);
        return (
          <div key={post.id} className="rounded-xl bg-white p-2 text-left">
            <Photo post={post} tone={((i + 2) % 3) + 1} className="block aspect-square w-full rounded-lg" />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="line-clamp-1 font-display text-[13px] font-semibold leading-tight text-zinc-900">
                {nameOf(post)}
              </span>
              {pct !== null && <HeatPercent pct={pct} size="text-[17px]" />}
            </div>
            <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-zinc-500">
              ▲ {post.upvoteCount}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** D — everything at once: bigger tile, name in Fraunces, heat percent, pill. */
function VariantD({ posts }: { posts: DraftPost[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
      {posts.map((post, i) => {
        const pct = pctOf(post);
        return (
          <div key={post.id} className="rounded-2xl bg-white p-2 pb-2.5 text-left">
            <div className="relative">
              <Photo
                post={post}
                tone={((i + 2) % 3) + 1}
                className="block aspect-[4/3] w-full rounded-xl"
              />
              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600">
                ▲ {post.upvoteCount}
              </span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
              <span className="line-clamp-2 min-h-[30px] font-display text-[14px] font-semibold leading-tight text-zinc-900">
                {nameOf(post)}
              </span>
              {pct !== null && <HeatPercent pct={pct} size="text-[22px]" />}
            </div>
            {post.restaurant && (
              <span className="mt-1 block truncate px-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {post.restaurant}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * E — D, ranked. The best-scoring plate takes a 2×2 cell and prints its
 * percent at feed size; the rest fall in behind it. This is the one that
 * needs a decision rather than a diff: it says the profile has a headline.
 */
function VariantE({ posts }: { posts: DraftPost[] }) {
  const ranked = [...posts].sort((a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1));
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
      {ranked.map((post, i) => {
        const pct = pctOf(post);
        const hero = i === 0;
        return (
          <div
            key={post.id}
            className={`rounded-2xl bg-white p-2 pb-2.5 text-left ${
              hero ? "col-span-2 row-span-2" : ""
            }`}
          >
            <div className="relative">
              <Photo
                post={post}
                tone={((i + 2) % 3) + 1}
                className={`block w-full ${hero ? "aspect-[4/3] rounded-xl" : "aspect-square rounded-lg"}`}
              />
              {hero && (
                <span className="mono-label absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-pm-orange-text">
                  Top plate
                </span>
              )}
              <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600">
                ▲ {post.upvoteCount}
              </span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
              <span
                className={`line-clamp-2 font-display font-semibold leading-tight text-zinc-900 ${
                  hero ? "text-[20px]" : "text-[13px] min-h-[30px]"
                }`}
              >
                {nameOf(post)}
              </span>
              {pct !== null && <HeatPercent pct={pct} size={hero ? "text-[38px]" : "text-[17px]"} />}
            </div>
            {post.restaurant && (
              <span className="mt-1 block truncate px-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {post.restaurant}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Block({
  letter,
  name,
  note,
  children,
}: {
  letter: string;
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="mono-label text-pm-orange-text">{letter}</span>
        <h2 className="font-display text-lg font-semibold text-zinc-900">{name}</h2>
      </div>
      <p className="mb-3 max-w-2xl text-sm text-pm-grey-text">{note}</p>
      {children}
    </section>
  );
}

export default function ProfileGridDraftPage() {
  const { account, loading } = useAuth();
  const [posts, setPosts] = useState<DraftPost[]>([]);

  useEffect(() => {
    if (!account) return;
    fetch("/api/posts?mine=1")
      .then((r) => r.json())
      .then((d: { posts: DraftPost[] }) => setPosts(d.posts.filter((p) => p.userId === account.id)))
      .catch(() => {});
  }, [account]);

  return (
    <>
      <Header />
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <p className="mono-label text-pm-orange-text">Draft · profile plate grid</p>
        <h1 className="font-display text-3xl font-semibold text-zinc-900">
          Six ways to draw your plates
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-pm-grey-text">
          Your real posts, on the real cream ground, at the real content width the
          profile uses. Nothing here is wired into the product — pick one and it moves
          into <span className="font-mono text-[13px]">ProfileShelves</span>, which both
          the web and phone trees share.{" "}
          <Link
            href="/account"
            className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
          >
            Compare against the live profile
          </Link>
          .
        </p>

        <div className="mt-8">
          {loading && <p className="text-sm text-pm-grey-text">Loading…</p>}
          {!loading && !account && (
            <p className="text-sm text-pm-grey-text">Sign in to see your own plates here.</p>
          )}
          {posts.length > 0 && (
            <>
              <Block
                letter="Now"
                name="What ships today"
                note="auto-fill with a 76px floor leaves ~12 tracks across a 936px column, so six posts sit at the minimum and half the row is empty. The meta line is 9.5px zinc-500 — smaller and greyer than the arrow beside it."
              >
                <Current posts={posts} />
              </Block>

              <Block
                letter="A"
                name="Grid math only"
                note="One line changed: auto-fit with a 150px floor. Empty tracks collapse, the photos double, nothing else moves. This is the floor of what's worth doing."
              >
                <VariantA posts={posts} />
              </Block>

              <Block
                letter="B"
                name="Pill on the photo"
                note="A, with the numbers moved onto the photo as the white pill DESIGN.md already specifies for grid cards. No card frame — at this size the photo is the card. White on a photograph instead of grey on cream."
              >
                <VariantB posts={posts} />
              </Block>

              <Block
                letter="C"
                name="Name + the feed's heat percent"
                note="A, with the dish named in Fraunces and the percent wearing .pct-heat — the same tier + ramp paint the feed card uses at 42px. An 89% plate now visibly burns hotter than an 84% one."
              >
                <VariantC posts={posts} />
              </Block>

              <Block
                letter="D"
                name="Everything at once"
                note="4:3 photo, upvotes on the pill, dish in Fraunces, percent at 22px in heat, restaurant in the mono label voice underneath. This is a plate that looks like a post rather than a thumbnail."
              >
                <VariantD posts={posts} />
              </Block>

              <Block
                letter="E"
                name="Ranked, with a headline"
                note="D, sorted by rating, with the top plate taking a 2×2 cell and its percent at feed size. The only variant that makes a claim: your profile has a best plate and it leads. Needs a call from you, not just a diff."
              >
                <VariantE posts={posts} />
              </Block>
            </>
          )}
        </div>
      </div>
    </>
  );
}
