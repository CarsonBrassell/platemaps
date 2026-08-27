"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { openPostFlash, closePostFlash, stashLanding } from "@/lib/postCelebration";
import { discardPhoto, uploadPhotos, type PhotoDraft } from "@/lib/photos";
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
import { tapFlash } from "@/lib/tapFlash";

/**
 * Posting a plate, phone version.
 *
 * This is an **adaptation of `src/app/post/page.tsx`, not a second composer**.
 * The web flow was already phone-shaped — camera first, one question per step, a
 * fixed action bar padded for the home indicator — so the steps, the branch
 * logic, the validation copy and the payload are the same code path, and all
 * five `components/post/*` pickers are reused untouched. If the two files ever
 * disagree about what a post is made of, that is a bug, not a design decision.
 *
 * Three things are genuinely different down here, and only three:
 *
 * - **No `Header`.** The web page carries the desktop chrome above the flow;
 *   here the title row *is* the chrome, with the leave-without-posting X in it.
 * - **The action bar clears the nav rather than sitting on the floor.** See the
 *   comment on it below — this is the one real collision between a full-screen
 *   stepped flow and a shell that owns the bottom of the screen.
 * - **Every destination is a `/m` one**, and every link carries `?nav=` so the
 *   variant switcher survives a post (see `PhoneNav`).
 */
type Step = "photo" | "kind" | "rate" | "where" | "dish" | "detail";

const noteField =
  "w-full rounded-xl bg-pm-grey-tint/60 px-3.5 py-2.5 text-base transition-colors placeholder:text-zinc-500 focus:bg-pm-grey-tint/40 focus:outline-2 focus:outline-offset-2 focus:outline-pm-orange";
const legend = "mono-label mb-1.5 block text-zinc-500";
/* `min-h-11`, not the web composer's `min-h-9`: these are the only controls in
   the flow a thumb has to hit precisely rather than a whole row, and 36px is
   under the floor AGENTS.md sets. Everything else about the chip is the web
   version's. */
const chip =
  "min-h-11 rounded-full px-3.5 text-sm font-medium transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

export default function PhonePost() {
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn, loading, refresh } = useAuth();

  /* The nav variant travels in the URL and has to survive the composer, or
     posting throws you back to the default nav and the comparison is over.
     Drop this alongside the switcher — same note as PhoneNav's. */
  const nav = params.get("nav");
  const to = (href: string) => {
    if (!nav) return href;
    return `${href}${href.includes("?") ? "&" : "?"}nav=${nav}`;
  };

  const [kind, setKind] = useState<PostKind | null>(null);
  // Always the camera: there is no longer a way to arrive holding photos, so
  // no step to skip past. See CameraCapture on why the pickers went.
  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);

  const [place, setPlace] = useState<PickableRestaurant | null>(null);
  const [dish, setDish] = useState<PickedDish | null>(null);
  /** The list the "where" step browses — fetched once, shared by both pickers. */
  const [restaurants, setRestaurants] = useState<PickableRestaurant[]>([]);
  const [pct, setPct] = useState(80);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [note, setNote] = useState("");
  const [bestAt, setBestAt] = useState<string | null>(null);
  const [worstAt, setWorstAt] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // On mount rather than when the "where" step opens: the composer is reached
  // by someone who has already decided to post, so the list is wanted within a
  // tap or two, and loading it behind the photo step means it is there.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // `fields=index` — see getRestaurantIndex in lib/db.ts.
        const res = await fetch("/api/restaurants?fields=index");
        if (!res.ok) return;
        const data: { restaurants: PickableRestaurant[] } = await res.json();
        if (cancelled) return;
        setRestaurants(data.restaurants);

        /* Arrived from a restaurant page's "post the first plate": the where
           step is already answered, so answer it. Applied here rather than in
           its own effect because `place` is a row rather than an id, and this
           callback is the moment the rows exist. A param naming no real
           restaurant sets nothing. Never *overwrites* a choice — once the
           visitor picks a place by hand, a stale URL param loses. */
        const preselected = data.restaurants.find((r) => r.id === params.get("restaurant"));
        if (preselected) setPlace((current) => current ?? preselected);
        // `params` is deliberately not a dependency: this runs once for the
        // URL the composer opened with, same as the fetch it rides on.
      } catch {
        // The picker shows its own "no match" state; nothing to add here.
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Every step starts at the top of itself.
   *
   * On the web page this is invisible — a step is shorter than a desktop
   * window, so there is nothing to scroll. Here a step is routinely taller than
   * the screen (the camera, a full menu), and without this, answering a
   * question two thirds of the way down a list drops you two thirds of the way
   * down the *next* question, past its own heading. Instant rather than smooth:
   * this is a screen change, not a movement across one, and a scroll animation
   * on every tap is motion `prefers-reduced-motion` would have to argue with.
   */
  useEffect(() => {
    /* The frame scrolls, not the document (see .pm-phone-content in phone.css),
       so this has to move the scroller. `window.scrollTo` stays as the fallback
       for any context where the page itself is what scrolls — one of the two is
       always a no-op, and guessing wrong means a step opens half way down. */
    document.querySelector(".pm-phone-content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [index]);

  /*
   * And an error is scrolled to, for the same reason inverted.
   *
   * The alert sits under the form, and on the detail step the form is taller
   * than the screen — measured at 390×645 the message landed 20px below the
   * fold, so pressing "Post it" with an empty caption looked like the button was
   * dead. `role="alert"` covers a screen reader; this covers everyone else.
   * `center` rather than `start` because the action bar owns the bottom 156px
   * and `nearest` would happily park the message behind it.
   */
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center" });
  }, [error]);

  /* Photo, where, dish, then the fork — the web composer's order, and it has
     to stay the web composer's order. See the long note there for why it
     follows the meal rather than the form, and why `where` must precede
     `dish`. Two versions of the site, one flow. */
  const steps = useMemo<Step[]>(() => {
    if (!kind) return ["photo", "where", "dish", "kind"];
    if (kind === "comment") return ["photo", "where", "dish", "kind", "detail"];
    return ["photo", "where", "dish", "kind", "rate", "detail"];
  }, [kind]);

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index === steps.length - 1;
  /* The camera takes the whole screen, so this step has no title row, no
     progress bar and no action bar — it carries its own. See CameraCapture. */
  const cameraStep = step === "photo" && isSignedIn && !loading;

  /*
   * Nothing scrolls behind a full-screen viewfinder.
   *
   * Same class the map screen uses, and the same reason: iOS still rubber-bands
   * the document under a fixed overlay, which drags the cream page up past the
   * edge of a picture that is supposed to run to it.
   */
  useEffect(() => {
    if (!cameraStep) return;
    document.documentElement.classList.add("pm-lock-scroll");
    return () => document.documentElement.classList.remove("pm-lock-scroll");
  }, [cameraStep]);

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
    // `kind` is index 3 now — see the web composer's note on this number.
    go(4);
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
    // `kind` sits after the place and the dish now, so it gets the line too.
    if (step === "photo") return null;
    return [dish?.name, place?.name].filter(Boolean).join(" · ") || null;
  }

  /** Returns an error to show, or null when the step is complete. */
  function problemWith(current: Step): string | null {
    if (current === "photo" && photos.length === 0) {
      return "Take a photo, or use “post without a photo” below.";
    }
    // The fork is downstream of this step now — no branch here to exempt.
    if (current === "where" && !place) {
      return "Pick the restaurant so the post lands in the right place on the map.";
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
    // Same wire shape as the web composer, deliberately: restaurantId/lat/lng
    // ride along so the post can be geo-filtered later, and `photosPublic` is
    // never sent — the API route reads it server-side off the signed-in user's
    // current toggle so it cannot be spoofed.
    const shared = {
      restaurant: place?.name,
      restaurantId: place?.id,
      restaurantLat: place?.lat,
      restaurantLng: place?.lng,
      locationLabel: place?.distance,
      media,
    };

    // One rating, one scale: the meter's 0-100 percent, tagged `dish` because
    // that is what it is about.
    if (kind === "dish") {
      return {
        ...shared,
        text: note.trim(),
        dishName: dish?.name,
        price: dish?.price,
        rating: pct,
        ratingKind: "dish" as const,
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
       lived in the browser, so a composer that gets abandoned — backed out of,
       or killed with the app — leaves nothing in the store to sweep up later.
       `uploadPhotos` is all-or-nothing and cleans up after itself if part of
       the batch fails.

       Ahead of the flash, deliberately. This is the step that can fail on a
       restaurant's signal, and once the white screen is up it *is* the
       confirmation — there is no honest way to raise it and then say the
       plate didn't make it. */
    let urls: string[];
    try {
      urls = await uploadPhotos(photos);
    } catch {
      setError("Your photos didn't upload. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    /* Raised on the tap, not on the response — the white screen is both the
       confirmation and the cover over this request, the navigation after it
       and the feed's own first fetch. It comes down from the feed, once the
       plate is actually on screen. See lib/postCelebration. */
    openPostFlash();
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(urls)),
      });
      const data = await res.json();
      if (!res.ok) {
        closePostFlash();
        /* The photos landed but the post was refused, so they belong to
           nothing. Taking them back out is the whole reason the upload waits
           until this press. */
        await Promise.allSettled(urls.map(discardPhoto));
        setError(data.error ?? "Couldn't publish that. Try again.");
        setSubmitting(false);
        return;
      }
      await refresh();
      /*
       * The plate travels in memory rather than in the URL.
       *
       * This used to push `?post=&earned=`, which the web feed reads — but
       * `/m/feed` deliberately takes no searchParams (see its page.tsx), so
       * both were being written to an address nothing was ever going to read:
       * no highlight, and no points confirmation, on the phone. The handoff
       * carries them to a screen that does, and the URL goes back to naming
       * the screen instead of the last thing that happened.
       */
      stashLanding({ postId: data.post.id, earned: Number(data.pointsEarned) || 0 });
      // Where the web flow ends, pointed at the phone tree's feed.
      router.push(to("/m/feed"));
    } catch {
      closePostFlash();
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

  /*
   * The camera step is its own screen, not a step inside the form.
   *
   * Every other step is a question with a heading, a progress bar above it and
   * the action bar below; the viewfinder is a picture, and chrome laid over a
   * picture is the only arrangement a camera has ever wanted. So this branch
   * replaces the whole layout rather than rendering inside it, and the two
   * controls the chrome was carrying — leave, and move on — are passed down.
   */
  const camera = (
    <CameraCapture
      fullscreen
      photos={photos}
      onChange={setPhotos}
      onClose={() => router.push(to("/m/feed"))}
      onDone={() => go(index + 1)}
      onSkip={() => {
        setError(null);
        go(1);
      }}
    />
  );

  const body = (
    /* pb-20 on top of the shell's own `--phone-nav-space` padding: the action
       bar floats above the nav, so the last field has to clear both. */
    <div className="px-4 pb-20 pt-4">
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
            {title()}
          </h1>
          {/* Context line, not an echo: the heading already names the step's
              own subject, so this carries what was decided before it. */}
          {subtitle() && <p className="mt-1 truncate text-sm text-zinc-500">{subtitle()}</p>}
        </div>
        <Link
          href={to("/m/feed")}
          aria-label="Leave without posting"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      </div>

      <div className="mb-5">
        {/* Both halves are machine values — a position in a sequence and an
            award off the points economy — so both set in mono per AGENTS.md.
            The number itself is never restated here: POINT_RULES owns it. */}
        <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-pm-grey-text">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span>Upvotes &amp; replies earn points</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-pm-grey-tint">
          <div
            className="step-progress h-full w-full rounded-full bg-pm-orange"
            style={{
              transform: `translateX(${((index + 1) / steps.length - 1) * 100}%)`,
            }}
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Posting progress"
          />
        </div>
      </div>

      <form id="phone-post-form" onSubmit={handleSubmit}>
        <div key={step} className={back ? "step-in-back" : "step-in"}>
          {/* No `photo` branch: that step is the full-screen camera above,
              rendered instead of this layout rather than inside it. */}

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
                  else — a restaurant's percent is the average of these. */}
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
                    below the fold once the keyboard is up. */}
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
                  <legend className={legend}>
                    What was this restaurant best at?{" "}
                    {/* `nowrap` because `.mono-label`'s 0.18em tracking makes the
                        legend wrap at 390px, and it was breaking mid-parenthetical. */}
                    <span className="whitespace-nowrap normal-case text-zinc-400">(pick one)</span>
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
                          onClick={(e) => {
                            /* Flash only, no hold: a chip toggles in place, so
                               there is no step change to wait for. */
                            tapFlash(e.currentTarget);
                            setBestAt(on ? null : b.label);
                          }}
                          className={`${on ? "chip-pop" : ""} ${chip} flex items-center gap-1.5 ${
                            on
                              ? "bg-pm-orange text-[#F7F4EC]"
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
                  weakness is visible anywhere in the app. Optional on purpose;
                  the chip already chosen as "best" is disabled here, since the
                  same aspect can't be both. */}
              {kind === "dish" && (
                <fieldset>
                  <legend className={legend}>
                    Anything let you down?{" "}
                    <span className="whitespace-nowrap normal-case text-zinc-400">(optional)</span>
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
                          onClick={(e) => {
                            /* Flash only, no hold: a chip toggles in place, so
                               there is no step change to wait for. */
                            tapFlash(e.currentTarget);
                            setWorstAt(on ? null : b.label);
                          }}
                          /* Orange, not the `red-700` DESIGN.md gives "let you
                             down" — both chip groups wear the one accent now.
                             That makes hue useless as the tell, and these two
                             rows render the *same* BEST_AT emoji and labels, so
                             the picked fault is struck through instead: a
                             strength and a fault can no longer read alike. */
                          className={`${on ? "chip-pop" : ""} ${chip} flex items-center gap-1.5 ${
                            isBest
                              ? "cursor-not-allowed bg-pm-grey-tint/40 text-zinc-400"
                              : on
                                ? "bg-pm-orange text-[#F7F4EC]"
                                : "bg-pm-grey-tint text-pm-grey-text hover:text-pm-orange-text"
                          }`}
                        >
                          <span aria-hidden="true">{b.emoji}</span>
                          <span className={on ? "line-through" : undefined}>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {/* A last look at what the card will say, so posting isn't a leap. */}
              <div className="rounded-2xl bg-white px-4 py-3">
                <p className="mono-label text-zinc-500">How it will read</p>
                <p className="font-display mt-1 text-base font-semibold text-zinc-900">
                  {dish?.name ?? place?.name ?? "Your post"}
                  {dish && place && (
                    <span className="font-sans text-sm font-normal text-zinc-500"> at {place.name}</span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-zinc-600">
                  {kind === "dish" && (
                    <span>
                      <span className="font-mono tabular-nums">{pct}%</span> · {bandForPercent(pct)}
                      {dish?.price ? (
                        <>
                          {" · "}
                          <span className="font-mono tabular-nums">{dish.price}</span>
                        </>
                      ) : null}
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
          <p
            ref={errorRef}
            role="alert"
            className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </form>
    </div>
  );

  return (
    /* The shell-collapse fix that used to sit here (min-[480px]:w-[390px])
       moved into phone.css — the shell itself is now a fixed 390px in the
       desktop preview, so every screen gets it, not just this one. */
    <div className="min-h-dvh">
      {loading ? (
        <div className="px-4 py-16" role="status">
          <div className="skeleton h-8 w-2/3 rounded-lg" />
          <div className="skeleton mt-4 h-24 w-full rounded-2xl" />
          <div className="skeleton mt-3 h-24 w-full rounded-2xl" />
          <span className="sr-only">Loading</span>
        </div>
      ) : !isSignedIn ? (
        /* Same door the web composer puts up, same reason given, pointed at the
           phone tree's account screen. Nothing about the flow is reachable
           signed out: a post carries your name and pays you points. */
        <div className="px-6 py-20 text-center">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
            Sign in to post a plate
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-pm-grey-text">
            Reviews and comments carry your name, and Plate Points come from the
            upvotes and replies your posts earn.
          </p>
          <Link
            href={to("/m/account")}
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            Sign in
          </Link>
          <p className="mt-4">
            <Link
              href={to("/m/feed")}
              className="inline-flex min-h-11 items-center px-3 text-sm text-pm-grey-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              Back to the feed
            </Link>
          </p>
        </div>
      ) : cameraStep ? (
        camera
      ) : (
        body
      )}

      {isSignedIn && !loading && !cameraStep && (
        /*
         * The action bar, lifted clear of the nav.
         *
         * A full-screen stepped flow wants the floor and `PhoneNav` already owns
         * it — and the nav is rendered by the /m layout, which this screen must
         * not edit, so it cannot be hidden for one route. So the bar stops
         * short: its box runs to the bottom edge (nothing shows through the gap
         * between the two) but its padding reserves exactly `--phone-nav-space`,
         * the number phone.css already publishes for how much floor the current
         * nav variant covers. On `arc` that is 96px, which is measured to clear
         * the raised create button, so Next never sits under it. Because the
         * value is a variable rather than a constant, switching `?nav=` moves
         * this bar with the nav instead of stranding it.
         *
         * Cream rather than the web bar's white-over-border: this is chrome
         * sitting on the ground the nav also sits on, and DESIGN.md rules out
         * the border the web version leans on to separate itself. z-30 keeps it
         * under the nav's z-40, so the two never fight over the same pixels.
         *
         * The `min-[480px]` block repeats what phone.css does for the nav —
         * pinning a fixed element into the 390px desktop preview column instead
         * of letting it span the whole window.
         */
        <div
          className="fixed inset-x-0 bottom-0 z-30 bg-[#F7F4EC] min-[480px]:left-1/2 min-[480px]:right-auto min-[480px]:w-[390px] min-[480px]:-translate-x-1/2"
          style={{ paddingBottom: "var(--phone-nav-space)" }}
        >
          <div className="flex items-center gap-3 px-4 pb-2 pt-2">
            <button
              type="button"
              onClick={() => (index === 0 ? router.push(to("/m/feed")) : go(index - 1))}
              className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-pm-grey-text transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
              {index === 0 ? "Cancel" : "Back"}
            </button>

            {/* The chooser and the two pickers answer themselves on tap, so a
                Next button there would be a second way to do the same thing. */}
            {step !== "kind" && (
              <button
                type="submit"
                form="phone-post-form"
                disabled={submitting}
                className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full bg-pm-orange px-6 text-sm font-semibold text-[#F7F4EC] transition-transform active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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
