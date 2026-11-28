"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmEmailPrompt } from "@/components/account/ConfirmEmailPrompt";
import { FindableQuestion } from "@/components/account/FindableQuestion";
import { CloseIcon } from "@/components/icons";
import { Avatar, StatusOrAdd } from "@/components/mobile/PhoneFindFriends";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useAuth } from "@/lib/auth";
import {
  buildUpload,
  mailHref,
  readDeviceContacts,
  requestContactsAccess,
  smsHref,
  type ContactsSupport,
  type DevicePerson,
} from "@/lib/contactsClient";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-orange";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The invitation, whole and fixed. It is put in the composer where the person
 * can read and change it before they send it themselves. No referral
 * parameter, nothing per-recipient.
 */
const INVITE_TEXT =
  "I’m on PlateMaps for finding the best plates in San Diego. Join me: https://platemaps.com";

/** How many invite rows are drawn at once; the filter reaches the rest. */
const INVITE_SHOWN = 50;

type FriendLite = { id: string; name: string; avatarUrl?: string };
type RowStatus = "friend" | "incoming" | "requested" | null;

/** Mirrors the match route's response row (`ContactMatch` in lib/db.ts, which is server-only). */
type ServerMatch = {
  id: string;
  name: string;
  avatarUrl?: string;
  status: "none" | "requested" | "incoming";
  ref: { kind: "email" | "phone"; index: number };
};

/**
 * One finished check, as the Friends screen keeps it while it is mounted.
 *
 * `contactName` and `invitees` come from the phone's address book and exist
 * only here in memory. The server sent back a position in the uploaded list,
 * never a name, an address or a number.
 */
export type ContactsResult = {
  matches: (FriendLite & { status: ServerMatch["status"]; contactName: string })[];
  /** Contacts that did not match and can be invited (a usable number or address). */
  invitees: DevicePerson[];
  /** iOS 18 "only these contacts". */
  limited: boolean;
  /** The server checked only the first part of the list (a new account). */
  truncated: boolean;
  /** Limited access with nothing shared at all. */
  nothingShared: boolean;
};

type Step = "explain" | "verify" | "working" | "results" | "denied" | "busy" | "error";

const TITLES: Record<Step, string> = {
  explain: "Find friends from your contacts",
  verify: "Confirm your email first",
  working: "Checking your contacts",
  results: "From your contacts",
  denied: "Contacts access is off",
  busy: "Try again later",
  error: "That didn’t work",
};

const PRIMARY = `min-h-11 w-full rounded-full bg-pm-orange px-5 text-sm font-medium text-[#F7F4EC] transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS}`;
/** A plain text button on the cream body, so `--pm-grey-text`, not zinc-500. */
const QUIET = `flex min-h-11 w-full items-center justify-center rounded-full text-sm text-pm-grey-text disabled:opacity-50 ${FOCUS}`;

/** "about 3 hours", "about 20 minutes": a wait in words, with the number in mono. */
function waitWords(seconds: number) {
  const hours = Math.round(seconds / 3600);
  const minutes = Math.max(1, Math.round(seconds / 60));
  return hours >= 1 ? (
    <>
      about <span className="font-mono tabular-nums">{hours}</span> {hours === 1 ? "hour" : "hours"}
    </>
  ) : (
    <>
      about <span className="font-mono tabular-nums">{minutes}</span>{" "}
      {minutes === 1 ? "minute" : "minutes"}
    </>
  );
}

/**
 * "Find friends from your contacts", start to finish.
 *
 *   explain -> (verify) -> [iOS prompt] -> working -> results
 *                                       \-> denied | busy | error
 *
 * What this component is responsible for getting right:
 *
 * - **Our explanation comes before Apple's prompt, every time.** The
 *   explainer is shown before every check; there is no "already explained"
 *   flag, so someone whose upload starts to include phone numbers always sees
 *   the wording that says so first. `requestContactsAccess` and
 *   `readDeviceContacts` are called from `check()` and nowhere else, and
 *   `check()` runs only from the Continue button. "Not now" and the close
 *   button never touch the plugin.
 * - **The explainer describes this upload, not uploads in general.** Its rows
 *   are built from `includePhones`, the same value handed to `buildUpload`.
 * - **Being found is a separate question.** Continue saves no setting. The
 *   `FindableQuestion` card under the results is the only thing here that can
 *   change "Find me from contacts", and only by a tap on it.
 * - **Nothing is claimed that the page cannot know.** An `sms:` or `mailto:`
 *   link hands off to iOS with no answer, so the Invite pill never changes to
 *   "Sent" or "Opened". No counts are shown anywhere.
 * - **Nothing is stored.** The result goes up to the Friends screen's state
 *   through `onResult` and is gone when that screen unmounts.
 *
 * The shell is PhoneFilterSheet's (scrim, grab handle, focus kept inside,
 * Escape, scroll lock) with a cream body, because this one holds white cards.
 */
export function PhoneContactsSheet({
  support,
  cached,
  onResult,
  onSupport,
  onClose,
  onSearchByUsername,
  sendRequest,
  statusFor,
  pendingId,
}: {
  /** What iOS said when the Friends screen asked. Never "unsupported" here. */
  support: ContactsSupport;
  /** The last check from this visit, if any: shown instead of running a new one. */
  cached: ContactsResult | null;
  onResult: (result: ContactsResult) => void;
  /** Tells the Friends screen what iOS answered, so its next open starts right. */
  onSupport: (support: ContactsSupport) => void;
  onClose: () => void;
  /** Close and put the cursor in the username search box. */
  onSearchByUsername: () => void;
  /** The Friends screen's own request sender (it also refreshes Requests). */
  sendRequest: (person: FriendLite) => void | Promise<void>;
  statusFor: (id: string) => RowStatus;
  pendingId: string | null;
}) {
  const { account, refresh } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const [step, setStep] = useState<Step>(
    cached ? "results" : support === "denied" ? "denied" : "explain",
  );
  const [access, setAccess] = useState<ContactsSupport>(support);
  const [result, setResult] = useState<ContactsResult | null>(cached);
  const [starting, setStarting] = useState(false);
  /** A one-line confirmation above the explainer ("Email confirmed."). */
  const [note, setNote] = useState("");
  const [busyText, setBusyText] = useState<ReactNode>(null);
  const [errorText, setErrorText] = useState("");
  const [filter, setFilter] = useState("");
  // The sheet only ever mounts from a tap, so there is no server render to disagree with.
  const [canShare] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  /* Phones go up only for an account whose own number is verified and
     current, on a deployment that has phone matching at all. The server
     ignores them otherwise; not sending them is what makes the explainer's
     "we send only email addresses" true rather than merely harmless. */
  const includePhones = account?.phoneVerified === true && account.phoneVerifyAvailable === true;

  /* The confirm step ends itself the moment the account reads confirmed,
     whichever way that was learned. */
  const justConfirmed = step === "verify" && account?.emailVerified === true;
  const shown: Step = justConfirmed ? "explain" : step;
  const shownNote = justConfirmed ? "Email confirmed." : note;

  // The handlers the keyboard effect needs, without re-running it per render:
  // re-running would hand focus back to the Friends screen mid-use.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restore?.focus?.();
    };
  }, []);

  useEffect(() => {
    // So "is the email confirmed" is this minute's answer, not app launch's.
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Each step replaces the whole body; put focus (and a screen reader) on
    // its title rather than leaving it on a button that no longer exists.
    headingRef.current?.focus();
  }, [shown]);

  function finish(next: ContactsResult) {
    setResult(next);
    onResult(next);
    setFilter("");
    setStep("results");
  }

  /**
   * The Continue button. The ONLY path to the iOS prompt and to reading the
   * address book.
   */
  async function check() {
    if (starting) return;
    setStarting(true);
    setNote("");
    try {
      await refresh();
      /* Before iOS is asked: no point granting access to a check the server
         will refuse. `account` here is the one this render was drawn with,
         which the refresh on opening made current; the refresh just above
         keeps the confirm step's own copy fresh. If the two ever disagree,
         the server's 403 below is the authority and lands on the same step. */
      if (account && !account.emailVerified) {
        setStep("verify");
        return;
      }

      const answer = await requestContactsAccess();
      setAccess(answer);
      onSupport(answer);
      if (answer !== "granted" && answer !== "limited") {
        setStep("denied");
        return;
      }

      setStep("working");
      let people: DevicePerson[];
      try {
        people = await readDeviceContacts();
      } catch {
        setErrorText("We couldn’t read your contacts. Try again.");
        setStep("error");
        return;
      }

      const limited = answer === "limited";
      const upload = buildUpload(people, { includePhones });
      const invitable = (list: DevicePerson[]) =>
        list.filter((p) => p.emails.length > 0 || p.phones.some((n) => smsHref(n, "") !== null));

      if (upload.emails.length === 0 && (upload.phones?.length ?? 0) === 0) {
        // Nothing to ask about, so no request and none of the day's checks spent.
        finish({
          matches: [],
          invitees: invitable(people),
          limited,
          truncated: false,
          nothingShared: limited && people.length === 0,
        });
        return;
      }

      let res: Response;
      try {
        res = await fetch("/api/contacts/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Only the identifiers. Names never go in this body.
          body: JSON.stringify(
            upload.phones ? { emails: upload.emails, phones: upload.phones } : { emails: upload.emails },
          ),
        });
      } catch {
        setErrorText("We couldn’t reach PlateMaps. Check your connection and try again.");
        setStep("error");
        return;
      }

      if (!res.ok) {
        const data: { code?: unknown; scope?: unknown } = await res.json().catch(() => ({}));
        if (res.status === 403 && data.code === "verify-first") {
          await refresh();
          setStep("verify");
          return;
        }
        if (res.status === 429) {
          const seconds = Number(res.headers.get("Retry-After"));
          const wait = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
          if (data.scope === "contacts-match:user-day") {
            setBusyText(
              wait ? (
                <>You&rsquo;ve checked a few times today. Try again in {waitWords(wait)}.</>
              ) : (
                "You’ve checked a few times today. Try again tomorrow."
              ),
            );
          } else if (data.scope === "contacts-match:user-month") {
            const when = wait
              ? new Date(Date.now() + wait * 1000).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })
              : "";
            setBusyText(
              when ? (
                <>
                  You&rsquo;ve reached this month&rsquo;s checks. Try again on{" "}
                  <span className="font-mono">{when}</span>.
                </>
              ) : (
                "You’ve reached this month’s checks. Try again later."
              ),
            );
          } else {
            setBusyText("Lots of people are checking right now. Try again later.");
          }
          setStep("busy");
          return;
        }
        setErrorText(
          res.status === 503
            ? "Try again in a moment."
            : res.status === 404
              ? "This isn’t available right now."
              : "Something went wrong. Try again.",
        );
        setStep("error");
        return;
      }

      const data: { matches?: unknown; truncated?: unknown } = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.matches) ? (data.matches as ServerMatch[]) : [];
      const matchedOwners = new Set<number>();
      const seenIds = new Set<string>();
      const matches: ContactsResult["matches"] = [];
      for (const row of rows) {
        if (!row || typeof row.id !== "string" || typeof row.name !== "string") continue;
        if (seenIds.has(row.id)) continue;
        const owners = row.ref?.kind === "phone" ? upload.phoneOwners : upload.emailOwners;
        const owner = owners?.[row.ref?.index];
        // A position we did not send is not a match we can label; skip it
        // rather than show a member with no reason next to their name.
        if (owner === undefined || !people[owner]) continue;
        seenIds.add(row.id);
        matchedOwners.add(owner);
        matches.push({
          id: row.id,
          name: row.name,
          avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : undefined,
          status: row.status === "requested" || row.status === "incoming" ? row.status : "none",
          contactName: people[owner].name,
        });
      }

      finish({
        matches,
        invitees: invitable(people.filter((_, index) => !matchedOwners.has(index))),
        limited,
        truncated: data.truncated === true,
        nothingShared: false,
      });
    } finally {
      setStarting(false);
    }
  }

  function share() {
    navigator.share({ text: INVITE_TEXT }).catch(() => {});
  }

  const shareButton = canShare && (
    <button type="button" onClick={share} className={QUIET}>
      Share an invite another way
    </button>
  );

  const usernameButton = (
    <button
      type="button"
      onClick={onSearchByUsername}
      className={`min-h-11 w-full rounded-full bg-pm-grey-tint px-5 text-sm font-medium text-zinc-700 ${FOCUS}`}
    >
      Search by username
    </button>
  );

  const limitedNote = (
    <p className="px-1 text-xs leading-snug text-pm-grey-text">
      You shared only some of your contacts. To check more, open Settings, tap PlateMaps, then
      Contacts.
    </p>
  );

  return (
    <div
      /* Same shell and the same reasons as PhoneFilterSheet: `overflow-hidden`
         keeps the transformed desktop phone frame from scrolling the sheet
         off its bottom edge, and z-[60] clears PhoneNav. */
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-pm-charcoal/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Cream, where the filter sheet is white: this body holds white cards,
          and a white card needs a ground to sit on. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="animate-sheet-in flex max-h-[86dvh] w-full flex-col rounded-t-2xl bg-[#F7F4EC]"
      >
        <div className="shrink-0 px-4 pb-1 pt-2.5">
          <div className="mx-auto h-1 w-10 rounded-full bg-zinc-300" />
          <div className="mt-1.5 flex items-center gap-2">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-lg font-semibold text-zinc-900 focus:outline-none"
            >
              {TITLES[shown]}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`-mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pm-grey-text ${FOCUS}`}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-[var(--phone-nav-space)] pt-1">
          {shown === "explain" && (
            <>
              {shownNote && (
                <p role="status" className="px-1 text-sm text-pm-grey-text">
                  {shownNote}
                </p>
              )}
              <ul className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 text-sm leading-snug text-zinc-700">
                {includePhones ? (
                  <li>
                    We send only the email addresses and phone numbers in your contacts to
                    PlateMaps, to check them against members who chose to be found.
                  </li>
                ) : (
                  <>
                    <li>
                      We send only the email addresses in your contacts to PlateMaps, to check
                      them against members who chose to be found.
                    </li>
                    <li>
                      Phone numbers stay on your phone. They&rsquo;re only used if you tap Invite,
                      to open Messages.
                    </li>
                  </>
                )}
                <li>We don&rsquo;t save your contacts. They&rsquo;re checked once and forgotten.</li>
              </ul>
              <button type="button" onClick={() => void check()} disabled={starting} className={PRIMARY}>
                {access === "granted" || access === "limited" ? "Check my contacts" : "Continue"}
              </button>
              <button type="button" onClick={onClose} className={QUIET}>
                Not now
              </button>
            </>
          )}

          {shown === "verify" && (
            <>
              <p className="px-1 text-sm leading-snug text-pm-grey-text">
                We only match people with a confirmed email, so yours needs confirming too.
              </p>
              <div className="rounded-2xl bg-white px-4 py-4">
                <ConfirmEmailPrompt
                  onConfirmed={() => {
                    setNote("Email confirmed.");
                    setStep("explain");
                  }}
                />
              </div>
              <button type="button" onClick={onClose} className={QUIET}>
                Not now
              </button>
            </>
          )}

          {shown === "working" && (
            // Can sit here for several seconds on a big address book.
            <p role="status" className="px-1 py-8 text-center text-sm text-pm-grey-text">
              Checking your contacts…
            </p>
          )}

          {shown === "denied" && (
            <>
              <p className="rounded-2xl bg-white px-4 py-4 text-sm leading-snug text-zinc-700">
                To use this, open the Settings app, tap PlateMaps, and turn on Contacts. You can
                still find anyone by username.
              </p>
              {/* No retry: once refused, iOS will not show its prompt again. */}
              {usernameButton}
              {shareButton}
            </>
          )}

          {shown === "busy" && (
            <>
              <p role="alert" className="rounded-2xl bg-white px-4 py-4 text-sm leading-snug text-zinc-700">
                {busyText}
              </p>
              {usernameButton}
            </>
          )}

          {shown === "error" && (
            <>
              <p role="alert" className="rounded-2xl bg-white px-4 py-4 text-sm leading-snug text-zinc-700">
                {errorText}
              </p>
              {/* Back to the explainer rather than straight into another
                  check: every check starts from our own words. */}
              <button type="button" onClick={() => setStep("explain")} className={PRIMARY}>
                Try again
              </button>
              {usernameButton}
            </>
          )}

          {shown === "results" && result && (
            <Results
              result={result}
              filter={filter}
              onFilter={setFilter}
              statusFor={statusFor}
              pendingId={pendingId}
              sendRequest={sendRequest}
              onCheckAgain={() => setStep("explain")}
              limitedNote={limitedNote}
              shareButton={shareButton}
              phoneHint={account?.phoneVerifyAvailable === true && !account.phoneVerified}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Results({
  result,
  filter,
  onFilter,
  statusFor,
  pendingId,
  sendRequest,
  onCheckAgain,
  limitedNote,
  shareButton,
  phoneHint,
}: {
  result: ContactsResult;
  filter: string;
  onFilter: (value: string) => void;
  statusFor: (id: string) => RowStatus;
  pendingId: string | null;
  sendRequest: (person: FriendLite) => void | Promise<void>;
  onCheckAgain: () => void;
  limitedNote: ReactNode;
  shareButton: ReactNode;
  phoneHint: boolean;
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return result.invitees;
    return result.invitees.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.emails.some((e) => e.includes(q)) ||
        p.phones.some((n) => n.includes(q)),
    );
  }, [filter, result.invitees]);

  return (
    <>
      {result.matches.length > 0 ? (
        <section aria-label="On PlateMaps">
          <p className="mono-label mb-1.5 pl-1 text-pm-grey-text">On PlateMaps</p>
          <ul className="flex flex-col gap-2">
            {result.matches.map((match) => (
              <ContactMatchRow
                key={match.id}
                match={match}
                /* The Friends screen's lists win (a request sent a second ago
                   is in them); the server's answer covers what they predate. */
                status={
                  statusFor(match.id) ??
                  (match.status === "requested" || match.status === "incoming" ? match.status : null)
                }
                pending={pendingId === match.id}
                onAdd={() => void sendRequest(match)}
              />
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-2xl bg-white px-4 py-5 text-center">
          <p className="font-display text-[15px] font-semibold text-zinc-900">No one found yet</p>
          <p className="mt-1 text-sm leading-snug text-zinc-500">
            People only show up here if they&rsquo;ve chosen to be found and confirmed their
            email. Try a username, or invite someone below.
          </p>
        </div>
      )}

      {/* Quiet notes, not errors. */}
      {result.limited && !result.nothingShared && limitedNote}
      {result.truncated && (
        <p className="px-1 text-xs leading-snug text-pm-grey-text">
          We checked your first <span className="font-mono tabular-nums">200</span> addresses. New
          accounts can check more after a week.
        </p>
      )}
      {phoneHint && (
        <p className="px-1 text-xs leading-snug text-pm-grey-text">
          <Link
            href="/m/account/settings"
            className={`rounded underline underline-offset-2 ${FOCUS}`}
          >
            Add your number
          </Link>{" "}
          to find friends by phone too.
        </p>
      )}

      {/* Asked here once more, after the person has seen what the feature
          does. Renders nothing once the account has answered anywhere. */}
      <FindableQuestion title="Want people to find you the same way?" />

      <section aria-label="Invite someone">
        <p className="mono-label mb-1.5 mt-1 pl-1 text-pm-grey-text">Invite someone</p>
        {result.nothingShared ? (
          <>
            <p className="mb-2 rounded-2xl bg-white px-4 py-4 text-sm text-zinc-700">
              You haven&rsquo;t shared any contacts yet.
            </p>
            {limitedNote}
          </>
        ) : result.invitees.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-4 text-sm text-zinc-700">
            No one else to invite from your contacts.
          </p>
        ) : (
          <>
            <input
              type="search"
              value={filter}
              onChange={(e) => onFilter(e.target.value)}
              placeholder="Filter contacts"
              aria-label="Filter contacts"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              /* 16px: iOS zooms the viewport for anything smaller. */
              className={`mb-2 min-h-11 w-full rounded-full bg-pm-grey-tint/60 px-4 text-[16px] text-zinc-900 placeholder:text-pm-grey-text focus:outline-none [&::-webkit-search-cancel-button]:hidden ${FOCUS}`}
            />
            {filtered.length === 0 ? (
              <p className="px-1 text-sm text-pm-grey-text">No contacts match that.</p>
            ) : (
              <ul className="flex flex-col overflow-hidden rounded-2xl bg-white">
                {filtered.slice(0, INVITE_SHOWN).map((person, index) => (
                  <InviteRow key={`${person.name}-${index}`} person={person} />
                ))}
              </ul>
            )}
            {filtered.length > INVITE_SHOWN && (
              <p className="mt-2 px-1 text-xs text-pm-grey-text">
                Use the filter to find someone further down.
              </p>
            )}
          </>
        )}
        <div className="mt-2">{shareButton}</div>
      </section>

      <button type="button" onClick={onCheckAgain} className={QUIET}>
        Check again
      </button>
    </>
  );
}

/**
 * A member found through a contact. Its own row rather than the Friends
 * screen's PersonRow, whose second line is tied to "why this person" reasons
 * from search. Here the reason is always the same and comes from the phone:
 * what the person calls this contact.
 */
function ContactMatchRow({
  match,
  status,
  pending,
  onAdd,
}: {
  match: ContactsResult["matches"][number];
  status: RowStatus;
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5">
      <Avatar person={match} size="md" />
      <Link
        href={`/m/u/${match.id}?from=friends`}
        className={`flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg ${FOCUS}`}
      >
        <span className="font-display flex min-w-0 items-center gap-1 text-[15px] font-semibold leading-tight text-zinc-900">
          <span className="truncate">{match.name}</span>
          <VerifiedBadge userId={match.id} />
        </span>
        <span className="mt-0.5 truncate text-xs text-zinc-500">
          {match.contactName} in your contacts
        </span>
      </Link>
      <StatusOrAdd status={status} pending={pending} onAdd={onAdd} />
    </li>
  );
}

/**
 * One contact, one Invite. The pill is a link the phone itself opens in
 * Messages (or Mail when there is only an address), addressed to this one
 * person, with the text there to read and edit. It never changes after a tap,
 * because the page is not told whether anything was sent. There is no
 * select-all and there must never be one.
 *
 * The name is the person's own label for the contact, so it sets in the prose
 * voice, not Fraunces; the number or address is a machine value, so mono.
 */
function InviteRow({ person }: { person: DevicePerson }) {
  let href: string | null = null;
  let detail = "";
  for (const phone of person.phones) {
    href = smsHref(phone, INVITE_TEXT);
    if (href) {
      detail = phone;
      break;
    }
  }
  if (!href && person.emails[0]) {
    href = mailHref(person.emails[0], INVITE_TEXT);
    detail = person.emails[0];
  }
  if (!href) return null;

  return (
    <li className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight text-zinc-900">{person.name}</span>
        {detail !== person.name && (
          <span className="mt-0.5 block truncate font-mono text-xs text-zinc-500">{detail}</span>
        )}
      </span>
      {/* The link is the 44px target; the pill inside it is only what it
          looks like. In a list this dense a 36px target puts the next row's
          Invite under the same thumb, and a miss opens a message addressed
          to a different person. */}
      <a
        href={href}
        aria-label={`Invite ${person.name}`}
        className={`flex min-h-11 shrink-0 items-center rounded-full ${FOCUS}`}
      >
        <span className="flex min-h-9 items-center rounded-full bg-pm-grey-tint px-3.5 text-xs font-medium text-pm-grey-text">
          Invite
        </span>
      </a>
    </li>
  );
}
