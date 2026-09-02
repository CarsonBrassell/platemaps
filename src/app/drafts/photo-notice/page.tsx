import { Header } from "@/components/Header";
import { ChevronIcon, CloseIcon } from "@/components/icons";

/**
 * DRAFT SURFACE — five more ways to draw the first-post photo notice.
 *
 * Not linked from anywhere and not meant to be, same as `drafts/progression`
 * and `drafts/map-search`. Deleting the folder removes it entirely; nothing
 * under `/post` or `/m/post` imports a line of this.
 *
 * What ships today is drawn first, at the top, so the five are being compared
 * against the real thing rather than against a memory of it: a centred sheet
 * over the composer, a paragraph of explanation, the ledger's segmented switch,
 * one orange action. See `components/post/PhotoPrivacyNotice.tsx`.
 *
 * All six are drawn at 390px — the phone is the tighter of the two bodies, and
 * a notice that survives there survives on the web. The camera behind them is a
 * charcoal stand-in for the live viewfinder, which now mounts underneath rather
 * than waiting for the notice to be answered.
 */
export default function PhotoNoticeDraftsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[860px] px-5 pb-24 pt-8">
        <h1 className="text-[32px]">The photo notice — five more ways</h1>
        <p className="mt-1.5 max-w-[70ch] text-[14px] text-pm-grey-text">
          Same job every time: say once, before the first plate, that the post is
          public and the photo is not, and offer the switch on the spot. What
          differs is how much of the screen it takes, whether it explains or
          demonstrates, and whether it is an overlay at all.
        </p>

        <Concept
          letter="NOW"
          name="The centred sheet"
          note="What ships. Two paragraphs, the ledger's own switch, one orange action. Reads as a notice: honest, quiet, and squarely in the way of the camera it is sitting on."
        >
          <Frame>
            <Sheet>
              <SheetHead title="Before your first plate" />
              <div className="px-4 py-3.5">
                <h3 className="font-display text-[17px] font-semibold leading-tight text-zinc-900">
                  Your photo is the private half
                </h3>
                <p className="mt-2 text-[13px] leading-snug text-zinc-600">
                  The plate itself is public. Your rating, the dish and what you
                  wrote go out to everyone the moment you post.
                </p>
                <p className="mt-2 text-[13px] leading-snug text-zinc-600">
                  Your photos don&rsquo;t. Friends see them on your post; everyone
                  else sees the post without them.
                </p>
                <p className="mono-label mt-4 text-zinc-500">Photos on public plates</p>
                <Switch />
              </div>
              <SheetFoot>
                <Pill>Got it</Pill>
              </SheetFoot>
            </Sheet>
          </Frame>
        </Concept>

        {/* ── A ────────────────────────────────────────────────────────── */}
        <Concept
          letter="A"
          name="Show both posts"
          note="Stops explaining and draws it: the same plate as a friend sees it and as a stranger sees it, side by side, and the switch says which of the two the world gets. The photo slot on the right is a warm tone block per the missing-photo rule, so the difference is a thing you can point at rather than a sentence you have to parse. Costs the most vertical space of the six."
        >
          <Frame>
            <Sheet>
              <SheetHead title="Before your first plate" />
              <div className="px-4 py-3.5">
                <h3 className="font-display text-[17px] font-semibold leading-tight text-zinc-900">
                  Your plate goes out. Your photo stays in.
                </h3>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniPost label="Friends see" withPhoto />
                  <MiniPost label="Everyone else" withPhoto={false} />
                </div>

                <p className="mono-label mt-4 text-zinc-500">Photos on public plates</p>
                <Switch />
              </div>
              <SheetFoot>
                <Pill>Got it</Pill>
              </SheetFoot>
            </Sheet>
          </Frame>
        </Concept>

        {/* ── B ────────────────────────────────────────────────────────── */}
        <Concept
          letter="B"
          name="A band on the viewfinder"
          note="Now that the camera runs underneath, this stops covering it. A short dark band on the shot, in the camera's own chrome — one line, the switch, done. The switch takes the screen-tab treatment rather than the tan track, for exactly the reason the map's Discover/Friends switch does: no track survives on a dark ground. The lightest of the six, and the only one where you can still see what you are pointing at."
        >
          <Frame>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className="rounded-2xl bg-black/65 px-4 py-3.5 backdrop-blur-sm">
                <p className="font-display text-[15px] font-semibold text-white">
                  Photos stay with friends
                </p>
                <p className="mt-1 text-[12px] leading-snug text-white/70">
                  Your plate is public either way — the photo is the part only
                  friends get.
                </p>
                <div className="mt-3 flex items-center gap-5">
                  <span className="mono-label border-b-2 border-pm-orange pb-1 text-white">
                    Friends only
                  </span>
                  <span className="mono-label border-b-2 border-transparent pb-1 text-white/55">
                    Everyone
                  </span>
                  <span className="ml-auto mono-label text-white/80">Got it</span>
                </div>
              </div>
            </div>
          </Frame>
        </Concept>

        {/* ── C ────────────────────────────────────────────────────────── */}
        <Concept
          letter="C"
          name="Just ask the question"
          note="No switch, no acknowledgement, no settings vocabulary — one question and two answers, and picking either one closes it. The default is marked so nobody is forced to choose blind. Fastest of the six at one tap, and the only one that never asks you to press OK on something you did not choose."
        >
          <Frame>
            <Sheet>
              <SheetHead title="One thing first" />
              <div className="px-4 py-4">
                <h3 className="font-display text-[19px] font-semibold leading-tight text-zinc-900">
                  Who sees your photos?
                </h3>
                <p className="mt-1.5 text-[13px] leading-snug text-zinc-600">
                  Your plate — the rating, the dish, your words — is public
                  either way.
                </p>

                <div className="mt-4 space-y-2">
                  <Choice
                    title="Just my friends"
                    sub="Everyone else sees the post without the photo."
                    marked
                  />
                  <Choice title="Everyone" sub="Your photos ride along on the public feed." />
                </div>
              </div>
            </Sheet>
          </Frame>
        </Concept>

        {/* ── D ────────────────────────────────────────────────────────── */}
        <Concept
          letter="D"
          name="A step in the flow"
          note="Not an overlay at all. It becomes step one of the composer, wearing the same heading, progress bar and action bar as the other five steps, and the bar honestly reads Step 1 of 5. Posting is already a stepped flow, so this reads as part of it rather than an interruption to it — at the price of putting a question between the plus button and the camera, which is the thing every other option here avoids."
        >
          <Frame plain>
            <div className="px-4 pt-4">
              <div className="mb-5 flex items-start gap-3">
                <h1 className="min-w-0 flex-1 font-display text-[24px] font-semibold leading-tight tracking-tight text-zinc-900">
                  Who sees your photos?
                </h1>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400">
                  <CloseIcon className="h-4 w-4" />
                </span>
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between font-mono text-[11px] tabular-nums text-pm-grey-text">
                  <span>Step 1 of 5</span>
                  <span>Asked once</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-pm-grey-tint">
                  <div className="h-full w-1/5 rounded-full bg-pm-orange" />
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-[14px] leading-snug text-zinc-600">
                  Your plate is public — the rating, the dish and what you wrote
                  reach everyone. Your photos are the part only friends get,
                  unless you say otherwise.
                </p>
                <p className="mono-label mt-4 text-zinc-500">Photos on public plates</p>
                <Switch full />
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-4 pb-3">
              <span className="flex min-h-11 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-pm-grey-text">
                <ChevronIcon className="h-4 w-4 rotate-180" />
                Cancel
              </span>
              <span className="ml-auto">
                <Pill>
                  Next
                  <ChevronIcon className="ml-1 inline h-4 w-4" />
                </Pill>
              </span>
            </div>
          </Frame>
        </Concept>

        {/* ── E ────────────────────────────────────────────────────────── */}
        <Concept
          letter="E"
          name="A label on the camera, not a dialog"
          note="Never blocks anything. A strip lives on the viewfinder saying what will happen, and opens into the switch if you tap it. Because it costs nothing to ignore, it can stay for the first several plates instead of firing once and never again — which fixes the real weakness of every other option here: the one showing lands on somebody who has not taken a photo yet and is not thinking about who sees it. The risk is the opposite one — a strip that is always there is a strip nobody reads."
        >
          <div className="flex flex-wrap gap-4">
            <Frame>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-2 rounded-full bg-black/60 py-2 pl-4 pr-2 backdrop-blur-sm">
                  <span className="mono-label text-white/85">Photos: friends only</span>
                  <span className="ml-auto mono-label rounded-full bg-white/15 px-3 py-1.5 text-white">
                    Change
                  </span>
                </div>
              </div>
            </Frame>

            <Frame>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="rounded-2xl bg-white p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="mono-label text-zinc-500">Photos on public plates</p>
                    <span className="mono-label text-zinc-400">Close</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
                    Off, only friends see your photos. Your plate is public
                    either way.
                  </p>
                  <Switch full />
                </div>
              </div>
            </Frame>
          </div>
        </Concept>
      </main>
    </>
  );
}

/* ────────────────────────────────────────────────────────────── pieces ── */

function Concept({
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
    <section className="mt-10">
      <div className="flex items-baseline gap-2.5">
        <span className="mono-label text-pm-orange-text">{letter}</span>
        <h2 className="text-[20px]">{name}</h2>
      </div>
      <p className="mt-1 max-w-[72ch] text-[13px] leading-snug text-pm-grey-text">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A 390px phone screen with the live viewfinder standing in behind it.
 *
 * `plain` swaps the camera for the composer's cream ground — concept D is the
 * only one of the six that is not drawn over a shot.
 */
function Frame({ children, plain = false }: { children: React.ReactNode; plain?: boolean }) {
  return (
    <div
      className={`relative h-[620px] w-[390px] overflow-hidden rounded-2xl ${
        plain ? "bg-[#F7F4EC]" : "bg-pm-charcoal"
      }`}
    >
      {!plain && (
        <>
          {/* Stand-in for the viewfinder: warm tone blocks under the charcoal,
              so the overlays are being read against something with tone in it
              rather than against flat black. */}
          <div className="absolute inset-0 opacity-[0.13]">
            <div className="h-1/3 w-full bg-[var(--pm-tone-1)]" />
            <div className="h-1/3 w-full bg-[var(--pm-tone-2)]" />
            <div className="h-1/3 w-full bg-[var(--pm-tone-3)]" />
          </div>
          <p className="mono-label absolute inset-x-0 top-1/3 text-center text-white/30">
            live camera
          </p>
        </>
      )}
      {children}
    </div>
  );
}

/** The dialog panel, at the size and position `Dialog`'s sheet variant lands on. */
function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white">{children}</div>
  );
}

function SheetHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <h2 className="min-w-0 flex-1 font-display text-[15px] font-semibold text-zinc-900">
        {title}
      </h2>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500">
        <CloseIcon className="h-4 w-4" />
      </span>
    </div>
  );
}

function SheetFoot({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end bg-white px-4 py-3">{children}</div>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-11 items-center rounded-full bg-pm-orange px-6 text-[13px] font-semibold text-white">
      {children}
    </span>
  );
}

/** The ledger's segmented switch, drawn statically at its default position. */
function Switch({ full = false }: { full?: boolean }) {
  return (
    <div className={`mt-2 flex gap-1 rounded-full bg-pm-grey-tint p-1 ${full ? "" : "w-fit"}`}>
      <span
        className={`mono-label flex min-h-11 items-center justify-center rounded-full bg-white text-zinc-900 ${
          full ? "flex-1" : "px-7"
        }`}
      >
        Hidden
      </span>
      <span
        className={`mono-label flex min-h-11 items-center justify-center rounded-full text-pm-grey-text ${
          full ? "flex-1" : "px-7"
        }`}
      >
        Shown
      </span>
    </div>
  );
}

/** Concept C's answer: a full-width pill that is the choice, not a control for one. */
function Choice({ title, sub, marked = false }: { title: string; sub: string; marked?: boolean }) {
  return (
    <div className="rounded-2xl bg-pm-grey-tint/60 px-4 py-3">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-zinc-900">
        {title}
        {marked && (
          <span aria-hidden="true" className="inline-block h-[5px] w-[5px] rounded-full bg-pm-orange" />
        )}
      </p>
      <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{sub}</p>
    </div>
  );
}

/** Concept A's two worked posts — the same plate, seen from both sides. */
function MiniPost({ label, withPhoto }: { label: string; withPhoto: boolean }) {
  return (
    <div>
      <p className="mono-label mb-1.5 text-zinc-500">{label}</p>
      <div className="rounded-xl bg-pm-grey-tint/50 p-2">
        {withPhoto ? (
          <div className="h-[68px] rounded-lg bg-[var(--pm-tone-2)]" />
        ) : (
          /* Not an empty slot and not a placeholder: on the public feed the
             media is stripped server-side, so the card closes up and the words
             carry it. Drawing a grey box here would be describing a bug. */
          <p className="h-[68px] font-display text-[13px] font-semibold leading-snug text-zinc-800">
            The bacon is a woven mat, not three sad strips.
          </p>
        )}
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] text-zinc-600">Double bacon</span>
          <span className="font-mono text-[11px] font-semibold tabular-nums text-pm-orange-text">
            93%
          </span>
        </div>
      </div>
    </div>
  );
}
