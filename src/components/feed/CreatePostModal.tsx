"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Dialog } from "./Dialog";
import { CameraIcon, VideoIcon, CloseIcon, ChevronIcon, StarIcon } from "@/components/icons";
import { resizeImageToDataUrl } from "@/lib/image";
import { FOOD_TAGS, tagAccent } from "@/data/foodTags";
import { POINT_RULES } from "@/lib/points";
import { restaurants } from "@/data/restaurants";
import type { Post, PostMedia } from "./types";

const MAX_PHOTOS = 4;
const PHOTO_SIZE = 1080;
const PHOTO_QUALITY = 0.72;

const field =
  "min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm transition-colors placeholder:text-zinc-400 focus:border-pm-orange focus:outline-none";
const label = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500";

type Draft = {
  file: File;
  url: string;
};

export function CreatePostModal({
  isSignedIn,
  onClose,
  onCreated,
}: {
  isSignedIn: boolean;
  onClose: () => void;
  onCreated: (post: Post, pointsEarned: number) => void;
}) {
  const [media, setMedia] = useState<Draft[]>([]);
  const [caption, setCaption] = useState("");
  const [dishName, setDishName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [price, setPrice] = useState("");
  const [rating, setRating] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setMediaError(null);
    const room = MAX_PHOTOS - media.length;
    if (room <= 0) {
      setMediaError(`You can add up to ${MAX_PHOTOS} photos.`);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!caption.trim() && !dishName.trim()) {
      setError("Add a dish name or write a caption so people know what this is.");
      return;
    }
    if (rating && (Number(rating) < 0 || Number(rating) > 10 || Number.isNaN(Number(rating)))) {
      setError("Rating has to be a number between 0 and 10.");
      return;
    }

    const payload: PostMedia[] = media.map((m) => ({
      url: m.url,
      type: "image",
      alt: [dishName.trim(), restaurant.trim() && `at ${restaurant.trim()}`]
        .filter(Boolean)
        .join(" "),
    }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: caption.trim() || dishName.trim(),
          dishName: dishName.trim() || undefined,
          restaurant: restaurant.trim() || undefined,
          locationLabel: locationLabel.trim() || undefined,
          price: price.trim() || undefined,
          rating: rating || undefined,
          tags,
          media: payload,
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
      setError("Couldn't reach PlateMap. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  if (!isSignedIn) {
    return (
      <Dialog title="Post a plate" onClose={onClose} variant="sheet">
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-zinc-600">
            <Link href="/account" className="font-medium text-pm-orange-text hover:underline">
              Sign in
            </Link>{" "}
            to post to the feed and start earning PM Points.
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Post a plate"
      onClose={onClose}
      variant="sheet"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Earn {POINT_RULES.createPost} PM Points for posting
          </p>
          <button
            type="submit"
            form="create-post-form"
            disabled={submitting || busy}
            className="min-h-11 rounded-full bg-pm-orange px-5 text-sm font-medium text-white transition-transform hover:brightness-105 active:scale-[0.97] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
          >
            {submitting ? "Publishing…" : "Publish"}
          </button>
        </div>
      }
    >
      <form id="create-post-form" onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div>
          <span className={label}>Photos</span>
          <div className="grid grid-cols-4 gap-2">
            {media.map((item, i) => (
              <div
                key={i}
                className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-inset ring-zinc-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={`Selected photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-pm-charcoal/75 text-white transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
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
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-pm-orange hover:text-pm-orange-text disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange"
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
            <button
              type="button"
              disabled
              title="Video posts need blob storage — coming next"
              className="flex items-center gap-1.5 text-xs text-zinc-400"
            >
              <VideoIcon className="h-4 w-4" />
              Add video (soon)
            </button>
            <span className="text-xs text-zinc-400">
              {media.length}/{MAX_PHOTOS} photos
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
            Dish
          </label>
          <input
            id="dish"
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            placeholder="Hot honey pepperoni pizza"
            maxLength={120}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="caption" className={label}>
            What did you eat?
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="restaurant" className={label}>
              Restaurant
            </label>
            <input
              id="restaurant"
              list="restaurant-options"
              value={restaurant}
              onChange={(e) => setRestaurant(e.target.value)}
              placeholder="Ember &amp; Crust"
              className={field}
            />
            <datalist id="restaurant-options">
              {restaurants.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="location" className={label}>
              Location
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

        <div className="grid grid-cols-2 gap-3">
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
          <div>
            <label htmlFor="rating" className={label}>
              Rating (out of 10)
            </label>
            <div className="relative">
              <StarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pm-orange" />
              <input
                id="rating"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="9.2"
                className={`${field} pl-9`}
              />
            </div>
          </div>
        </div>

        <fieldset>
          <legend className={label}>Tags</legend>
          <div className="flex flex-wrap gap-1.5">
            {FOOD_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange ${
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

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
