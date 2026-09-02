"use client";

import { useState } from "react";
import { Dialog } from "@/components/feed/Dialog";
import { type LedgerVariant } from "@/components/account/ledger";
import { useAuth } from "@/lib/auth";

/**
 * The one time the app asks who sees your photos.
 *
 * `share_photos_publicly` is off by default and the composer never mentions it,
 * so without this the rule is invisible: someone posts a plate, the photo they
 * took reaches their friends and nobody else, and nothing anywhere said so.
 * That is a good default and a bad secret.
 *
 * **It is a question, not a notice, and that is the whole design.** There is no
 * switch here and no OK button: two answers, and picking either one is both the
 * setting and the acknowledgement. The earlier version explained the rule in two
 * paragraphs and then asked you to press a button agreeing you had read it,
 * which is one tap of ceremony on top of a decision that was already only one
 * tap. Whichever answer is pressed, `sharePhotosPublicly` and `photoNoticeSeen`
 * ride the same request — one round trip, one dismissal.
 *
 * **It opens at the composer's front door — the moment the orange plus is
 * pressed.** `photos_public` is snapshotted onto the post row at write time
 * (see its migration), so anything shown on the way back from `/api/posts`
 * would be explaining a decision already made for the plate it was explaining.
 *
 * It is a **layer over the camera screen, not a gate in front of it**: the
 * viewfinder mounts underneath and is already live, so answering this puts you
 * straight into the shot rather than starting the lens from cold. One
 * consequence to know about — on an account that has never granted camera
 * access, the browser's own permission prompt is raised by what is behind this
 * dialog, so the two arrive together.
 *
 * Two things the copy deliberately does not say. It does not call the *post*
 * friends-only — every post reaches Discover either way, and only the media is
 * stripped (`getDiscoverFeed`); copy that promised more than that would be a
 * promise the app doesn't keep. And it does not spell out that `photos_public`
 * is frozen per-post, for the same reason `SettingsLedger` doesn't: read aloud
 * it turns a guarantee into an apology.
 *
 * Dismissing it — Escape, the X, the backdrop — leaves the flag unset and drops
 * you into the composer anyway. Nobody is held out of the camera by a question,
 * and somebody who closed it unanswered has not chosen anything, so the next
 * plate asks again.
 */
export function PhotoPrivacyNotice({
  variant = "web",
  onDismiss,
  onAnswer,
}: {
  variant?: LedgerVariant;
  /** Closed unanswered. Leaves the flag unset; the composer opens anyway. */
  onDismiss: () => void;
  /** Answered. The setting and the flag are already written. */
  onAnswer: () => void;
}) {
  const { account, updateSettings } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!account) return null;

  async function answer(sharePhotosPublicly: boolean) {
    setSaving(true);
    setError("");
    /* Both fields in one request. The settings route writes the toggle and
       latches the notice independently, so this cannot half-succeed into the
       state that would matter — a latched flag over an unwritten answer. */
    const result = await updateSettings({ sharePhotosPublicly, photoNoticeSeen: true });
    setSaving(false);
    if (result) {
      setError(result);
      return;
    }
    onAnswer();
  }

  return (
    <Dialog title="One thing first" variant="sheet" onClose={onDismiss}>
      <div className="px-5 py-4">
        <h3 className="font-display text-xl font-semibold leading-tight tracking-tight text-zinc-900">
          Who sees your photos?
        </h3>
        <p
          className={`mt-1.5 leading-snug text-zinc-600 ${
            variant === "phone" ? "text-[15px]" : "text-sm"
          }`}
        >
          Your plate &mdash; the rating, the dish, your words &mdash; is public
          either way.
        </p>

        {/* The answers are the control. No switch above them stating the same
            thing twice, and no confirming button below them: pressing one of
            these writes the setting and closes the dialog. */}
        <div className="mt-4 space-y-2" role="group" aria-label="Who sees your photos">
          <Answer
            title="Just my friends"
            sub="Everyone else sees the post without the photo."
            current={!account.sharePhotosPublicly}
            disabled={saving}
            onPick={() => void answer(false)}
          />
          <Answer
            title="Everyone"
            sub="Your photos ride along on the public feed."
            current={account.sharePhotosPublicly}
            disabled={saving}
            onPick={() => void answer(true)}
          />
        </div>

        <p className="mt-3.5 text-xs text-zinc-500">
          You can change this any time under Privacy in your settings.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * One answer: a full-width tile that *is* the choice.
 *
 * `current` marks whichever way the account is set right now with the 5px
 * orange bullet the header nav uses for the page you are on — the same meaning,
 * at row scale. On a first plate that is always "Just my friends", but somebody
 * who found the setting before they found the composer sees their own answer
 * marked rather than the default.
 */
function Answer({
  title,
  sub,
  current,
  disabled,
  onPick,
}: {
  title: string;
  sub: string;
  current: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="w-full rounded-2xl bg-pm-grey-tint/60 px-4 py-3 text-left transition-colors hover:bg-pm-grey-tint disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange motion-reduce:transition-none"
    >
      <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
        {title}
        {current && (
          <>
            <span
              aria-hidden="true"
              className="inline-block h-[5px] w-[5px] rounded-full bg-pm-orange"
            />
            <span className="sr-only">(current setting)</span>
          </>
        )}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-zinc-500">{sub}</span>
    </button>
  );
}
