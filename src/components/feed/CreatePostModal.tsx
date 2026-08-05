"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { EmojiSlider } from "./EmojiSlider";
import { CameraIcon, VideoIcon, CloseIcon, ChevronIcon } from "@/components/icons";
import { resizeImageToDataUrl } from "@/lib/image";
import { FOOD_TAGS, tagAccent } from "@/data/foodTags";
import { AMENITIES, VIBES, faceForRating } from "@/data/reviewScales";
import { POINT_RULES } from "@/lib/points";
import { restaurants } from "@/data/restaurants";
import type { Post, PostMedia } from "./types";

const MAX_PHOTOS = 4;
const PHOTO_SIZE = 1080;
const PHOTO_QUALITY = 0.72;

const STEPS = ["The plate", "The verdict", "The details"] as const;

const field =
  "min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm transition-colors placeholder:text-zinc-400 focus:border-pm-orange focus:outline-none";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";

type Draft = { file: File; url: string };

export function CreatePostModal({
  isSignedIn,
  onClose,
  onCreated,
}: {
  isSignedIn: boolean;
  onClose: () => void;
  onCreated: (post: Post, pointsEarned: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [back, setBack] = useState(false);

  const [media, setMedia] = useState<Draft[]>([]);
  const [dishName, setDishName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [price, setPrice] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [rating, setRating] = useState(8);
  const [vibeIndex, setVibeIndex] = useState(2);
  const [tags, setTags] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [caption, setCaption] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const face = faceForRating(rating);
  const vibe = VIBES[vibeIndex];
  const isLast = step === STEPS.length - 1;

  function go(next: number) {
    setBack(next < step);
    setError(null);
    setStep(next);
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setMediaError(null);
    const room = MAX_PHOTOS - media.length;
    if (room <= 0) {
      setMediaError(`Up to ${MAX_PHOTOS} photos per plate.`);
      return;
    }
    setBusy(true);
    const next: Draft[] = [];
    for (const file of Array.from(list).slice(0, room)) {
      if (!file.type.startsWith("image/")) {
        setMediaError("Only image files can be added right now.");
        continue;
      }
      try {
        next.push({ file, url: await resizeImageToDataUrl(file, PHOTO_SIZE, PHOTO_QUALITY) });
      } catch {
        setMediaError(`Couldn't process ${file.name}. Try a different photo.`);
      }
    }
    setMedia((prev) => [...prev, ...next]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function move(index: number, direction: -1 | 1) {
    setMedia((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * Functional update, not a read of the current array — two chips tapped in
   * the same tick would otherwise both start from the same stale list and the
   * second would discard the first.
   */
  function toggle(set: React.Dispatch<React.SetStateAction<string[]>>, value: string) {
    set((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function publish() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: caption.trim() || `${face.label} — ${dishName.trim()}`,
          dishName: dishName.trim(),
          restaurant: restaurant.trim() || undefined,
          locationLabel: locationLabel.trim() || undefined,
          price: price.trim() || undefined,
          rating,
          vibe: vibe.label,
          tags,
          amenities,
          media: media.map<PostMedia>((m) => ({
            url: m.url,
            type: "image",
            alt: [dishName.trim(), restaurant.trim() && `at ${restaurant.trim()}`]
              .filter(Boolean)
              .join(" "),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't publish that. Try again.");
        setSubmitting(false);
        return;
      }
      onCreated(data.post, data.pointsEarned);
    } catch {
      setError("Couldn't reach PlateMaps. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  /** Enter advances a step instead of submitting a half-filled review. */
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 0 && !dishName.trim()) {
      setError("What was it? Give the dish a name so people know what they're looking at.");
      return;
    }
    if (isLast) {
      void publish();
      return;
    }
    go(step + 1);
  }

  if (!isSignedIn) {
    return (
      <Dialog title="Post a plate" onClose={onClose} variant="sheet">
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-zinc-600">
            <Link href="/account" className="font-medium text-pm-orange-text hover:underline">
              Sign in
            </Link>{" "}
            to review what you&apos;re eating and start earning PM Points.
          </p>
        </div>
      </Dialog>
    );
  }

  const anim = back ? "step-in-back" : "step-in";

  return (
    <Dialog
      title={STEPS[step]}
      onClose={onClose}
      variant="sheet"
      footer={
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
            >
              <ChevronIcon className="h-4 w-4 rotate-180" />
              Back
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              Earn {POINT_RULES.createPost} PM Points for posting
            </p>
          )}

          <button
            type="submit"
            form="review-form"
            disabled={submitting || busy}
            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full bg-pm-orange px-5 text-sm font-semibold text-white transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {isLast ? (submitting ? "Posting…" : "Post review") : "Next"}
            {!isLast && <ChevronIcon className="h-4 w-4" />}
          </button>
        </div>
      }
    >
      {/* Progress rail — the only always-visible sign of how much is left. */}
      <div className="sticky top-0 z-10 bg-white/95 px-5 pb-3 pt-3 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-zinc-400">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-pm-grey-tint">
          <div
            className="step-progress h-full rounded-full bg-pm-orange"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label="Review progress"
          />
        </div>
      </div>

      <form id="review-form" onSubmit={handleSubmit} className="px-5 pb-5">
        {step === 0 && (
          <div key="step-0" className={`${anim} space-y-4`}>
            <div>
              <span className={label}>Photos</span>
              <div className="grid grid-cols-4 gap-2">
                {media.map((item, i) => (
                  <div
                    key={i}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-inset ring-zinc-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={`Selected photo ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-pm-charcoal/75 text-white transition-transform hover:scale-110"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                    <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move photo ${i + 1} earlier`}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-zinc-700 disabled:opacity-30"
                      >
                        <ChevronIcon className="h-3 w-3 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === media.length - 1}
                        aria-label={`Move photo ${i + 1} later`}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-zinc-700 disabled:opacity-30"
                      >
                        <ChevronIcon className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {media.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition-all hover:-translate-y-0.5 hover:border-pm-orange hover:text-pm-orange-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
                  >
                    <CameraIcon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{busy ? "Adding…" : "Add"}</span>
                  </button>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handleFiles(e.target.files)}
                className="sr-only"
                aria-label="Choose photos"
              />

              <div className="mt-2 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <VideoIcon className="h-4 w-4" />
                  Video coming soon
                </span>
                <span className="text-xs text-zinc-400">
                  {media.length}/{MAX_PHOTOS}
                </span>
              </div>

              {mediaError && (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {mediaError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="dish" className={label}>
                What was it?
              </label>
              <input
                id="dish"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                placeholder="Hot honey pepperoni pizza"
                maxLength={120}
                autoFocus
                className={`${field} text-base`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="restaurant" className={label}>
                  Where
                </label>
                <input
                  id="restaurant"
                  list="restaurant-options"
                  value={restaurant}
                  onChange={(e) => setRestaurant(e.target.value)}
                  placeholder="Landini&apos;s"
                  className={field}
                />
                <datalist id="restaurant-options">
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="price" className={label}>
                  Price
                </label>
                <input
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="$18"
                  className={field}
                />
              </div>
            </div>

            <div>
              <label htmlFor="location" className={label}>
                How far
              </label>
              <input
                id="location"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="0.8 miles away"
                className={field}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div key="step-1" className={`${anim} space-y-4`}>
            <EmojiSlider
              id="rating-slider"
              label="How good was it?"
              hint={`${rating}/10`}
              emoji={face.emoji}
              caption={face.label}
              value={rating}
              min={0}
              max={10}
              valueText={`${rating} out of 10 — ${face.label}`}
              onChange={setRating}
            />

            <EmojiSlider
              id="vibe-slider"
              label="What was the room like?"
              emoji={vibe.emoji}
              caption={vibe.label}
              blurb={vibe.blurb}
              value={vibeIndex}
              min={0}
              max={VIBES.length - 1}
              valueText={`${vibe.label} — ${vibe.blurb}`}
              onChange={setVibeIndex}
            />
          </div>
        )}

        {step === 2 && (
          <div key="step-2" className={`${anim} space-y-5`}>
            <fieldset>
              <legend className={label}>When&apos;s it for?</legend>
              <div className="flex flex-wrap gap-1.5">
                {FOOD_TAGS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(setTags, tag)}
                      className={`${on ? "chip-pop" : ""} rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                        on
                          ? "bg-pm-charcoal text-white ring-pm-charcoal"
                          : `${tagAccent(tag)} hover:brightness-95`
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className={label}>What stood out?</legend>
              <div className="flex flex-wrap gap-1.5">
                {AMENITIES.map((a) => {
                  const on = amenities.includes(a.label);
                  return (
                    <button
                      key={a.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(setAmenities, a.label)}
                      className={`${on ? "chip-pop" : ""} flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-all hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
                        on
                          ? "bg-pm-orange-tint text-pm-orange-text ring-pm-orange"
                          : "bg-white text-zinc-600 ring-zinc-200 hover:text-pm-orange-text"
                      }`}
                    >
                      <span aria-hidden="true">{a.emoji}</span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="caption" className={label}>
                Anything else? <span className="normal-case text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Crispy crust, spicy honey, and definitely worth ordering again."
                rows={3}
                maxLength={2000}
                className={`${field} resize-none py-2`}
              />
            </div>

            {/* A last look at what the card will say, so publishing isn't a leap. */}
            <div className="rounded-xl bg-pm-grey-tint/50 px-4 py-3 ring-1 ring-inset ring-zinc-200/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Your review
              </p>
              <p className="font-display mt-1 text-base font-semibold text-zinc-900">
                {dishName.trim() || "Your dish"}
                {restaurant.trim() && (
                  <span className="font-sans text-sm font-normal text-zinc-500">
                    {" "}
                    at {restaurant.trim()}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                <span aria-hidden="true">{face.emoji}</span> {rating}/10 · {vibe.emoji}{" "}
                {vibe.label}
                {price.trim() && ` · ${price.trim()}`}
              </p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
