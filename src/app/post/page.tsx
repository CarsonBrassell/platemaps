"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { takePhotos } from "@/lib/photoHandoff";
import { MAX_PHOTOS, resizePhotos, type PhotoDraft } from "@/lib/photos";
import { POINT_RULES } from "@/lib/points";
import { BEST_AT } from "@/data/reviewScales";
import type { Restaurant } from "@/data/restaurants";
import { CloseIcon, ChevronIcon, StarIcon } from "@/components/icons";
import { CameraCapture } from "@/components/post/CameraCapture";
import { KindChooser, type PostKind } from "@/components/post/KindChooser";
import { RestaurantPicker } from "@/components/post/RestaurantPicker";
import { DishPicker, type PickedDish } from "@/components/post/DishPicker";
import { StarPicker, verdictForStars } from "@/components/post/StarPicker";
import { PercentMeter, bandForPercent } from "@/components/post/PercentMeter";
import type { PostMedia } from "@/components/feed/types";

/**
 * Posting a plate, as a page rather than a modal.
 *
 * The camera opens first and everything else is decided after it: a photo is
 * what a plate review is made of, so it is the opening move rather than a field
 * further down a form. The one door past it — "just leave a comment" — skips the
 * photo, not the choice; both routes meet at the same question about what kind
 * of post this is.
 *
 * From there one fork picks the instrument: five stars for a restaurant, a
 * percentage meter for a dish off its real menu, or neither for a comment. Both
 * ratings land in the existing 0–10 `rating` column — stars doubled, a
 * percentage divided by ten — so the feed, the map pins and the hot score keep
 * reading one number and nothing downstream had to learn a second scale.
 */
type Step = "photo" | "kind" | "where" | "dish" | "rate" | "detail";

const shell = "app-shell mx-auto my-6 w-full max-w-7xl overflow-hidden rounded-2xl border border-zinc-200/60";
const noteField =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-400 focus:border-pm-orange focus:outline-none";
const legend = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";
const chip =
  "min-h-9 rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export default function PostPage() {
  const router = useRouter();
  const { isSignedIn, loading, refresh } = useAuth();

  // Photos picked on the feed travel in memory rather than through the URL, and
  // arriving with them means the camera step has already been answered.
  const [handoff] = useState<File[]>(() => takePhotos());

  const [kind, setKind] = useState<PostKind | null>(null);
  const [index, setIndex] = useState(handoff.length > 0 ? 1 : 0);
  const [back, setBack] = useState(false);

  const [place, setPlace] = useState<Restaurant | null>(null);
  const [dish, setDish] = useState<PickedDish | null>(null);
  const [stars, setStars] = useState(0);
  const [pct, setPct] = useState(80);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [note, setNote] = useState("");
  const [bestAt, setBestAt] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Files handed over from the feed still have to be resized before they can be
  // posted, and the camera step they would have gone through was skipped.
  useEffect(() => {
    if (handoff.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { photos: ready } = await resizePhotos(handoff, MAX_PHOTOS);
      if (!cancelled && ready.length) setPhotos(ready);
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff]);

  const steps = useMemo<Step[]>(() => {
    if (!kind) return ["photo", "kind"];
    if (kind === "comment") return ["photo", "kind", "where", "detail"];
    if (kind === "restaurant") return ["photo", "kind", "where", "rate", "detail"];
    return ["photo", "kind", "where", "dish", "rate", "detail"];
  }, [kind]);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index === steps.length - 1;

  function go(next: number) {
    setBack(next < index);
    setError(null);
    setIndex(next);
  }

  function chooseKind(next: PostKind) {
    // Switching branches after backing up would otherwise carry a dish or a
    // star count into a flow that has no place to show it.
    if (kind && kind !== next) {
      setDish(null);
      setStars(0);
      setPct(80);
      setBestAt(null);
    }
    setKind(next);
    go(2);
  }

  function title() {
    switch (step) {
      case "photo":
        return "What are you eating?";
      case "kind":
        return "What are you posting?";
      case "where":
        return "Where were you?";
      case "dish":
        return "What did you order?";
      case "rate":
        return kind === "restaurant"
          ? `How was ${place?.name ?? "it"}?`
          : "Would you tell someone to order it?";
      case "detail":
        return kind === "comment" ? "What do you want to say?" : "Anything else?";
    }
  }

  /** What sits under the heading, when it adds something the heading doesn't. */
  function subtitle(): string | null {
    if (step === "photo" || step === "kind") return null;
    if (step === "rate" && kind === "restaurant") return null;
    return [dish?.name, place?.name].filter(Boolean).join(" · ") || null;
  }

  /** Returns an error to show, or null when the step is complete. */
  function problemWith(current: Step): string | null {
    if (current === "photo" && photos.length === 0) {
      return "Take a photo, or use “just leave a comment” below to post without one.";
    }
    if (current === "where" && kind !== "comment" && !place) {
      return "Pick the restaurant so the plate lands in the right place on the map.";
    }
    if (current === "dish" && !dish) {
      return "Choose a dish off the menu, or type what you ordered.";
    }
    if (current === "rate" && kind === "restaurant" && stars === 0) {
      return "Tap a star to set your rating.";
    }
    if (current === "detail" && !note.trim()) {
      return kind === "comment"
        ? "Write your comment before posting."
        : "Say something about it — a rating on its own doesn't tell anyone what to order.";
    }
    return null;
  }

  function altFor() {
    if (dish && place) return `${dish.name} at ${place.name}`;
    if (dish) return dish.name;
    if (place) return `A plate at ${place.name}`;
    return "";
  }

  function payload() {
    const media = photos.map<PostMedia>((p) => ({ url: p.url, type: "image", alt: altFor() }));
    const shared = { restaurant: place?.name, locationLabel: place?.distance, media };

    if (kind === "restaurant") {
      return { ...shared, text: note.trim(), rating: stars * 2, vibe: bestAt ?? undefined };
    }
    if (kind === "dish") {
      return {
        ...shared,
        text: note.trim(),
        dishName: dish?.name,
        price: dish?.price,
        rating: pct / 10,
      };
    }
    return { ...shared, text: note.trim() };
  }

  async function publish() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't publish that. Try again.");
        setSubmitting(false);
        return;
      }
      await refresh();
      router.push(`/feed?post=${data.post.id}&earned=${data.pointsEarned}`);
    } catch {
      setError("Couldn't reach PlateMaps. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  /** Enter advances a step rather than posting something half-written. */
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = problemWith(step);
    if (problem) {
      setError(problem);
      return;
    }
    if (isLast) {
      void publish();
      return;
    }
    go(index + 1);
  }

  const body = (
    <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-5 sm:px-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-[28px]">
            {title()}
          </h1>
          {/* Context line, not an echo: the heading already names the restaurant
              on the star step and the dish on the meter step. */}
          {subtitle() && <p className="mt-1 truncate text-sm text-zinc-500">{subtitle()}</p>}
        </div>
        <Link
          href="/feed"
          aria-label="Leave without posting"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      </div>

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-zinc-400">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span>{POINT_RULES.createPost} PM Points when you post</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-pm-grey-tint">
          <div
            className="step-progress h-full rounded-full bg-pm-orange"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Posting progress"
          />
        </div>
      </div>

      <form id="post-form" onSubmit={handleSubmit}>
        <div key={step} className={back ? "step-in-back" : "step-in"}>
          {step === "photo" && (
            <CameraCapture
              photos={photos}
              onChange={setPhotos}
              onSkip={() => {
                setError(null);
                go(1);
              }}
            />
          )}

          {step === "kind" && (
            <>
              {photos.length > 0 && (
                <p className="mb-3 rounded-xl bg-pm-orange-tint/60 px-3.5 py-2.5 text-sm text-pm-orange-text">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"} ready — they go on
                  whichever you pick.
                </p>
              )}
              <KindChooser onChoose={chooseKind} />
            </>
          )}

          {step === "where" && (
            <RestaurantPicker
              selectedId={place?.id ?? null}
              onSelect={(r) => {
                setPlace(r);
                // Picking is the answer to this step; making someone then press
                // Next would be asking the same question twice.
                go(index + 1);
              }}
              onSkip={
                kind === "comment"
                  ? () => {
                      setPlace(null);
                      go(index + 1);
                    }
                  : undefined
              }
            />
          )}

          {step === "dish" && place && (
            <DishPicker
              restaurantId={place.id}
              restaurantName={place.name}
              selectedId={dish?.id ?? null}
              onSelect={(d) => {
                setDish(d);
                go(index + 1);
              }}
            />
          )}

          {step === "rate" && kind === "restaurant" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p id="stars-label" className="text-sm font-semibold text-zinc-800">
                Your rating
              </p>
              <div className="mt-3">
                <StarPicker value={stars} onChange={setStars} labelledBy="stars-label" />
              </div>
            </div>
          )}

          {step === "rate" && kind === "dish" && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <PercentMeter
                id="dish-meter"
                value={pct}
                onChange={setPct}
                label={
                  dish
                    ? `How much would you recommend the ${dish.name.toLowerCase()}?`
                    : "How much would you recommend it?"
                }
              />
            </div>
          )}

          {step === "detail" && (
            <div className="space-y-5">
              {/* No photo section here on any branch — the camera screen already
                  asked, and asking twice reads as though the first answer was
                  lost. */}
              <div>
                <label htmlFor="note" className={legend}>
                  {kind === "comment" ? "Your comment" : "In your words"}
                </label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    kind === "comment"
                      ? "The line outside moves faster than it looks."
                      : "Crispy crust, spicy honey, worth ordering again."
                  }
                  rows={kind === "comment" ? 5 : 3}
                  maxLength={2000}
                  className={`${noteField} resize-none`}
                />
              </div>

              {kind === "restaurant" && (
                <fieldset>
                  <legend className={legend}>
                    What was this restaurant best at?{" "}
                    <span className="normal-case text-zinc-400">(pick one)</span>
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {BEST_AT.map((b) => {
                      const on = bestAt === b.label;
                      return (
                        <button
                          key={b.label}
                          type="button"
                          aria-pressed={on}
                          // Tapping the chosen one again clears it — "best at"
                          // is a claim, and there has to be a way to unmake it.
                          onClick={() => setBestAt(on ? null : b.label)}
                          className={`${on ? "chip-pop" : ""} ${chip} flex items-center gap-1.5 ${
                            on
                              ? "bg-pm-charcoal text-white ring-pm-charcoal"
                              : "bg-white text-zinc-600 ring-zinc-200 hover:text-pm-orange-text"
                          }`}
                        >
                          <span aria-hidden="true">{b.emoji}</span>
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {/* A last look at what the card will say, so posting isn't a leap. */}
              <div className="rounded-xl bg-pm-grey-tint/50 px-4 py-3 ring-1 ring-inset ring-zinc-200/70">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  How it will read
                </p>
                <p className="font-display mt-1 text-base font-semibold text-zinc-900">
                  {dish?.name ?? place?.name ?? "Your post"}
                  {dish && place && (
                    <span className="font-sans text-sm font-normal text-zinc-500">
                      {" "}
                      at {place.name}
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-zinc-600">
                  {kind === "restaurant" && (
                    <>
                      <span className="flex gap-0.5" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <StarIcon
                            key={s}
                            className={`h-4 w-4 ${s <= stars ? "text-pm-orange" : "text-zinc-300"}`}
                          />
                        ))}
                      </span>
                      <span>
                        {verdictForStars(stars)}
                        {bestAt && ` · best at ${bestAt.toLowerCase()}`}
                      </span>
                    </>
                  )}
                  {kind === "dish" && (
                    <span>
                      {pct}% · {bandForPercent(pct)}
                      {dish?.price ? ` · ${dish.price}` : ""}
                    </span>
                  )}
                  {kind === "comment" && (
                    <span>{note.trim() ? "Comment only — no rating" : "Nothing written yet"}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </div>
  );

  return (
    <div className={shell}>
      <Header />

      <div className="bg-white/40">
        {loading ? (
          <div className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6" role="status">
            <div className="skeleton h-8 w-2/3 rounded-lg" />
            <div className="skeleton mt-4 h-24 w-full rounded-2xl" />
            <div className="skeleton mt-3 h-24 w-full rounded-2xl" />
            <span className="sr-only">Loading</span>
          </div>
        ) : !isSignedIn ? (
          <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900">
              Sign in to post a plate
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600">
              Reviews and comments carry your name, and posting earns you{" "}
              {POINT_RULES.createPost} PM Points.
            </p>
            <Link
              href="/account"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-white transition-transform hover:brightness-105 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Sign in
            </Link>
            <p className="mt-4 text-sm">
              <Link href="/feed" className="text-zinc-500 underline hover:text-zinc-800">
                Back to the feed
              </Link>
            </p>
          </div>
        ) : (
          body
        )}
      </div>

      {isSignedIn && !loading && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-sm"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => (index === 0 ? router.push("/feed") : go(index - 1))}
              className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
              {index === 0 ? "Cancel" : "Back"}
            </button>

            {/* The chooser and the two pickers answer themselves on tap, so a
                Next button there would be a second way to do the same thing. */}
            {step !== "kind" && (
              <button
                type="submit"
                form="post-form"
                disabled={submitting}
                className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full bg-pm-orange px-6 text-sm font-semibold text-white transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
              >
                {isLast ? (submitting ? "Posting…" : "Post it") : "Next"}
                {!isLast && <ChevronIcon className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

