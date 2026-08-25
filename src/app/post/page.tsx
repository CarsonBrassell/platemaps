"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { discardPhoto, uploadPhotos, type PhotoDraft } from "@/lib/photos";
import { POINT_RULES } from "@/lib/points";
import { BEST_AT } from "@/data/reviewScales";
import { CloseIcon, ChevronIcon } from "@/components/icons";
import { CameraCapture } from "@/components/post/CameraCapture";
import { KindChooser, type PostKind } from "@/components/post/KindChooser";
import { RestaurantPicker, type PickableRestaurant } from "@/components/post/RestaurantPicker";
import { DishPicker, type PickedDish } from "@/components/post/DishPicker";
import { PercentMeter, bandForPercent } from "@/components/post/PercentMeter";
import type { PostMedia } from "@/components/feed/types";
import { CharCount } from "@/components/post/CharCount";
import { MAX_POST_TEXT } from "@/lib/postLimits";

/**
 * Posting a plate, as a page rather than a modal.
 *
 * The camera opens first and everything else is decided after it: a photo is
 * what a plate review is made of, so it is the opening move rather than a field
 * further down a form. The one door past it — "just leave a comment" — skips the
 * photo, not the choice.
 *
 * ## One instrument
 *
 * There is one rating in the product and it is a percent on a plate. The meter
 * is the only instrument here; the five-star restaurant review that used to sit
 * beside it is gone, and with it the fork that made a poster choose between two
 * scales before they could say anything. A restaurant's own number is no longer
 * entered by anyone — it is what its plates add up to (lib/plateScore.ts).
 *
 * The place-level chips ride along on the plate review rather than getting their
 * own flow: you were at the restaurant to eat the dish, so "best at" and "what
 * let you down" are answerable on the same screen as the caption. That is what
 * keeps the per-category scores alive without a second door to walk through.
 */
type Step = "photo" | "kind" | "rate" | "where" | "dish" | "detail";

const shell = "mx-auto w-full max-w-7xl pb-12";
const noteField =
  "w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";
const legend = "mono-label mb-1.5 block text-zinc-500";
const chip =
  "min-h-9 rounded-full px-3 text-xs font-medium transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

function PostComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, loading, refresh } = useAuth();

  const [kind, setKind] = useState<PostKind | null>(null);
  // Always the camera: there is no longer a way to arrive holding photos, so
  // no step to skip past. See CameraCapture on why the pickers went.
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);

  const [place, setPlace] = useState<PickableRestaurant | null>(null);
  const [dish, setDish] = useState<PickedDish | null>(null);
  /**
   * The list the "where" step browses.
   *
   * Fetched once here rather than imported, because restaurants live in
   * Postgres now and this page is a client component all the way up. Starting
   * empty is safe: the picker renders its own empty state, and the step it
   * belongs to is never the first one someone sees.
   */
  const [restaurants, setRestaurants] = useState<PickableRestaurant[]>([]);
  const [pct, setPct] = useState(80);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [note, setNote] = useState("");
  const [bestAt, setBestAt] = useState<string | null>(null);
  const [worstAt, setWorstAt] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // On mount rather than when the "where" step opens: the composer is reached
  // by someone who has already decided to post, so the list is wanted within a
  // tap or two, and loading it behind the photo step means it is there.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // `fields=index` — the five-ish columns the picker reads, not all
        // fourteen. See the route and `getRestaurantIndex` in lib/db.ts.
        const res = await fetch("/api/restaurants?fields=index");
        if (!res.ok) return;
        const data: { restaurants: PickableRestaurant[] } = await res.json();
        if (cancelled) return;
        setRestaurants(data.restaurants);

        /* Arrived from a restaurant page's comment field: the where step is
           already answered, so answer it. Applied here rather than in its own
           effect because `place` is a row rather than an id, and this callback
           is the moment the rows exist. A param naming no real restaurant sets
           nothing, and a hand-picked place always beats a stale URL. The phone
           composer does exactly this — see the note there. */
        const preselected = data.restaurants.find(
          (r) => r.id === searchParams.get("restaurant"),
        );
        if (preselected) setPlace((current) => current ?? preselected);
        // `searchParams` is deliberately not a dependency: this runs once for
        // the URL the composer opened with, same as the fetch it rides on.
      } catch {
        // The picker shows its own "no match" state; nothing to add here.
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo<Step[]>(() => {
    if (!kind) return ["photo", "kind"];
    if (kind === "comment") return ["photo", "kind", "where", "detail"];
    /* The rating comes before the place and the dish, which is the reverse of how
       this read for most of its life. The old order walked the poster through
       naming the restaurant and the dish first and asked for the verdict last, so
       the two screens with the most typing on them stood between someone and the
       one thing they opened the composer to say. Rating first also means the
       meter's screen is the one screen that never has to wait on a fetch.

       It cannot move any earlier than this. `kind` has to be answered before it,
       because a comment post has no rating step at all, and the camera is the
       composer's front door by design (see this file's header). `dish` still
       follows `where` — DishPicker browses the chosen restaurant's menu, so it
       has nothing to show until there is a place. */
    return ["photo", "kind", "rate", "where", "dish", "detail"];
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
    // rating into a flow that has no place to show it.
    if (kind && kind !== next) {
      setDish(null);
      setPct(80);
      setBestAt(null);
      setWorstAt(null);
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
        return "How good was it?";
      case "detail":
        return kind === "comment" ? "What do you want to say?" : "Anything else?";
    }
  }

  /** What sits under the heading, when it adds something the heading doesn't. */
  function subtitle(): string | null {
    if (step === "photo" || step === "kind") return null;
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
    // The meter has no unset state — it opens at 80 and every position is a
    // real answer — so the rate step is never incomplete.
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

  /** `mediaUrls` are the blob store's, handed over by `publish` once they exist. */
  function payload(mediaUrls: string[]) {
    const media = mediaUrls.map<PostMedia>((url) => ({ url, type: "image", alt: altFor() }));
    // restaurantId/lat/lng ride along so the post can be geo-filtered later
    // with no further migration — see the restaurantId columns in lib/db.ts.
    // photosPublic itself isn't sent: the API route reads it server-side from
    // the signed-in user's current toggle, so it can't be spoofed by the
    // client and always reflects the setting at the true moment of posting.
    const shared = {
      restaurant: place?.name,
      restaurantId: place?.id,
      restaurantLat: place?.lat,
      restaurantLng: place?.lng,
      locationLabel: place?.distance,
      media,
    };

    // One rating, one scale: the meter's 0-100 percent, tagged `dish` because
    // that is what it is about. `ratingKind` stays on the wire even though only
    // one value is ever written — rows from before the star review was retired
    // still carry `restaurant`, and the feed reads the tag to render those back
    // as what they were. The API route re-validates the range; this isn't the
    // only place it's enforced.
    if (kind === "dish") {
      return {
        ...shared,
        text: note.trim(),
        dishName: dish?.name,
        price: dish?.price,
        rating: pct,
        ratingKind: "dish" as const,
        // `vibe` keeps carrying the best-at pick so existing post cards keep
        // rendering their chip; bestAspect/worstAspect are what the per-aspect
        // scores are actually built from. These used to ride on the restaurant
        // review and now ride here, which is the only place they can — see the
        // note at the top of this file.
        vibe: bestAt ?? undefined,
        bestAspect: bestAt ?? undefined,
        worstAspect: worstAt ?? undefined,
      };
    }
    return { ...shared, text: note.trim() };
  }

  async function publish() {
    setError(null);
    setSubmitting(true);

    /* The photos go up here and nowhere earlier. Everything before this press
       lived in the browser, so a composer that gets abandoned leaves nothing
       in the store to sweep up later. `uploadPhotos` is all-or-nothing and
       cleans up after itself if part of the batch fails. */
    let urls: string[];
    try {
      urls = await uploadPhotos(photos);
    } catch {
      setError("Your photos didn't upload. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(urls)),
      });
      const data = await res.json();
      if (!res.ok) {
        /* The photos landed but the post was refused, so they belong to
           nothing. Taking them back out is the whole reason the upload waits
           until this press. */
        await Promise.allSettled(urls.map(discardPhoto));
        setError(data.error ?? "Couldn't publish that. Try again.");
        setSubmitting(false);
        return;
      }
      await refresh();
      router.push(`/feed?post=${data.post.id}&earned=${data.pointsEarned}`);
    } catch {
      await Promise.allSettled(urls.map(discardPhoto));
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
          <span>{POINT_RULES.createPost} Plate Points when you post</span>
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
              restaurants={restaurants}
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

          {step === "rate" && kind === "dish" && (
            <div className="rounded-2xl bg-white p-5">
              {/* Your own number for the plate, not a prediction about someone
                  else — "how good was it" is the question the whole product's
                  scale answers, and a restaurant's percent is the average of
                  these. */}
              <PercentMeter
                id="dish-meter"
                value={pct}
                onChange={setPct}
                label={dish ? `Your rating for the ${dish.name.toLowerCase()}` : "Your rating"}
              />
            </div>
          )}

          {step === "detail" && (
            <div className="space-y-5">
              {/* No photo section here on any branch — the camera screen already
                  asked, and asking twice reads as though the first answer was
                  lost. */}
              <div>
                {/* Label and counter share the line: the number belongs to the
                    field it caps, and stacking it under the textarea puts it
                    below the fold on a phone once the keyboard is up. */}
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor="note" className={`${legend} mb-0`}>
                    {kind === "comment" ? "Your comment" : "In your words"}
                  </label>
                  <CharCount value={note} />
                </div>
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
                  maxLength={MAX_POST_TEXT}
                  className={`${noteField} resize-none`}
                />
              </div>

              {kind === "dish" && (
                <fieldset>
                  {/* "Besides the food" is doing real work, not softening the
                      question: the rating above already scored the food, and
                      without this line the missing Food chip reads as an
                      oversight rather than as the point. */}
                  <legend className={legend}>
                    Besides the food, what was this place best at?{" "}
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
                              ? "bg-pm-charcoal text-white"
                              : "bg-pm-grey-tint text-pm-grey-text hover:text-zinc-900"
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

              {/* The other half of the signal. Without it the only thing a
                  restaurant can ever be rated on is what it's best at, so no
                  weakness is visible anywhere in the app — a place with great
                  food and bad service reads as pure praise.

                  Optional on purpose: one tap, skippable, and skipping just
                  means this review has nothing negative to report rather than
                  everything being fine. The chip already chosen as "best" is
                  disabled here, since the same aspect can't be both. */}
              {kind === "dish" && (
                <fieldset>
                  <legend className={legend}>
                    Anything let you down?{" "}
                    <span className="normal-case text-zinc-400">(optional)</span>
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {BEST_AT.map((b) => {
                      const on = worstAt === b.label;
                      const isBest = bestAt === b.label;
                      return (
                        <button
                          key={b.label}
                          type="button"
                          aria-pressed={on}
                          disabled={isBest}
                          onClick={() => setWorstAt(on ? null : b.label)}
                          className={`${on ? "chip-pop" : ""} ${chip} flex items-center gap-1.5 ${
                            isBest
                              ? "cursor-not-allowed bg-pm-grey-tint/40 text-zinc-400"
                              : on
                                ? "bg-red-700 text-white"
                                : "bg-pm-grey-tint text-pm-grey-text hover:text-red-700"
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
              <div className="rounded-xl bg-pm-grey-tint/50 px-4 py-3">
                <p className="mono-label text-zinc-500">
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
                  {kind === "dish" && (
                    <span>
                      {pct}% · {bandForPercent(pct)}
                      {dish?.price ? ` · ${dish.price}` : ""}
                      {bestAt && ` · best at ${bestAt.toLowerCase()}`}
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
              {POINT_RULES.createPost} Plate Points.
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


/**
 * `useSearchParams` opts the tree into client-side rendering, and Next refuses
 * to prerender a page that reaches for it with no boundary to fall back to.
 * The composer reads `?restaurant=` to answer its own "where" step, so the
 * hook stays and the boundary goes here.
 *
 * `null` rather than a skeleton: what is behind this is a camera that opens on
 * mount, and a placeholder of the same shape would be on screen for the one
 * frame before the real viewfinder replaced it.
 */
export default function PostPage() {
  return (
    <Suspense fallback={null}>
      <PostComposer />
    </Suspense>
  );
}
