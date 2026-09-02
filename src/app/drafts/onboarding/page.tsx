import { Header } from "@/components/Header";
import {
  CheckIcon,
  ChevronIcon,
  CompassIcon,
  HomeIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";

/**
 * DRAFT SURFACE — five shapes a first-run tutorial could take.
 *
 * Not linked from anywhere and not meant to be, same as `drafts/photo-notice`
 * and `drafts/progression`. Deleting the folder removes it entirely.
 *
 * **What is being compared is the form, not the copy.** All five say the same
 * three things, because those three things are what PRODUCT.md says the product
 * is: the dish is the unit of review, the map shows what is good near you now,
 * and the recent local plates only exist because people post them. What differs
 * is whether that arrives as screens you page through, marks on the real app, a
 * single card, a list of things to go do, or a first search that teaches by
 * being used.
 *
 * One thing none of them do: sell Plate Points. PRODUCT.md is explicit that the
 * points economy is a supply-side mechanism and "should never be presented as
 * the differentiator" — an onboarding slide about earning points would be doing
 * exactly that, on the one screen where a new user is deciding what this app is
 * for. D is the only one that mentions points at all, and only as the reason to
 * post rather than as the reason to be here.
 *
 * Drawn at 390px, the phone being the tighter body and, per PRODUCT.md, the one
 * this is actually used on.
 */
export default function OnboardingDraftsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1240px] px-5 pb-24 pt-8">
        <h1 className="text-[32px]">First run — five shapes</h1>
        <p className="mt-1.5 max-w-[72ch] text-[14px] text-pm-grey-text">
          There is no onboarding today: signing up drops you straight onto the
          feed. All five below say the same three things — the dish is the unit,
          the map is local and now, and the plates exist because people post
          them. What differs is how much of your attention each one asks for
          before you are allowed to use the app.
        </p>

        {/* ── A ────────────────────────────────────────────────────────── */}
        <Concept
          letter="A"
          name="The carousel"
          note="The one everybody means by 'app tutorial'. Three full screens, dots, Next, and a Skip that is always reachable. Its virtue is that it can say a whole idea per screen with a picture above it; its cost is three taps before anybody has seen the product, and the well-known fact that most people press Skip. Note what the pictures are: real fragments of the app, not illustration — a plate card, the map, the composer."
        >
          <Row>
            <Phone>
              <Slide
                step={1}
                title="Order the right thing"
                body="Reviews here are about one dish, not the whole restaurant. A great place can still serve a weak plate."
              >
                <PlateCard />
              </Slide>
            </Phone>
            <Phone>
              <Slide
                step={2}
                title="What's good near you, tonight"
                body="The map shows what people around you are eating now, rather than an average built up over years."
              >
                <MapBlock />
              </Slide>
            </Phone>
            <Phone>
              <Slide
                step={3}
                title="Your plate is someone's dinner"
                body="Recent local verdicts only exist because people post them. What you ate today is what someone orders tomorrow."
                last
              >
                <ComposerBlock />
              </Slide>
            </Phone>
          </Row>
        </Concept>

        {/* ── B ────────────────────────────────────────────────────────── */}
        <Concept
          letter="B"
          name="Marks on the real screen"
          note="No separate screens at all. The app loads, everything dims except one thing, and a caption says what that thing is for. Three taps and you are already home, because you never left. It teaches where things are rather than what the product believes, which is the trade — it can point at the plus button but it cannot explain why the dish is the unit of review. Needs anchor positions in the real layout, so it is the most fragile of the five to build."
        >
          <Row>
            <Phone>
              <MiniFeed dim />
              <Coach
                bottom={128}
                step={1}
                title="This is a plate, not a place"
                body="One dish, one verdict, one photo. The percent is what that plate scored."
              />
              {/* z-20 puts the marked thing back above the z-10 scrim. That
                  lift is the whole mechanism: nothing is drawn around the
                  element, it is simply the only thing still lit. */}
              <div className="absolute inset-x-4 top-[92px] z-20">
                <PlateCard />
              </div>
              <MiniNav />
            </Phone>
            <Phone>
              <MiniFeed dim />
              <Coach
                bottom={128}
                step={3}
                title="Post what you ate"
                body="Takes a photo, names the dish off the real menu, and asks how good it was."
              />
              <MiniNav highlight="plus" />
            </Phone>
          </Row>
        </Concept>

        {/* ── C ────────────────────────────────────────────────────────── */}
        <Concept
          letter="C"
          name="One card, three lines"
          note="Everything the carousel says, on one screen, with no paging. Read in about eight seconds and dismissed in one tap. It gives up the picture-per-idea that A buys with its three screens, and in exchange it never stands between anybody and the app for more than a moment. The numerals are mono because they are a position in a sequence, which is a machine value."
        >
          <Row>
            <Phone>
              <MiniFeed dim />
              <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white px-5 py-5">
                <p className="mono-label text-pm-orange-text">Welcome to PlateMaps</p>
                <h3 className="mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
                  Three things and you&rsquo;re in
                </h3>

                <ol className="mt-4 space-y-3.5">
                  <Line
                    n="01"
                    title="The dish is the review"
                    body="Not the restaurant. A great place can serve a weak plate."
                  />
                  <Line
                    n="02"
                    title="Near you, tonight"
                    body="What people around you are eating now, on a map."
                  />
                  <Line
                    n="03"
                    title="Post what you ate"
                    body="Yours is what someone else orders tomorrow."
                  />
                </ol>

                <div className="mt-5 flex justify-end">
                  <Pill>Start looking</Pill>
                </div>
              </div>
            </Phone>
          </Row>
        </Concept>

        {/* ── D ────────────────────────────────────────────────────────── */}
        <Concept
          letter="D"
          name="A card that ticks itself off"
          note="Not an overlay, and nothing to dismiss. A card sits at the top of the feed with three real things to go and do, and each one crosses itself out when you actually do it, then the card leaves for good. It survives being ignored — somebody who scrolls past on day one still meets it on day two — which is the one thing every overlay here cannot claim. It is also the slowest to pay off, and the only one that has to survive the feed being empty."
        >
          <Row>
            <Phone>
              <div className="px-4 pt-4">
                <div className="rounded-2xl bg-white p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="mono-label text-pm-orange-text">Start here</p>
                    <span className="font-mono text-[11px] tabular-nums text-zinc-500">1 / 3</span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <Task done title="Find something near you" body="Open the map and see what's close." />
                    <Task title="Save a plate" body="Keep the ones you want to order." />
                    <Task
                      title="Post your first plate"
                      body="Worth 10 Plate Points, and it's what keeps the feed local."
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3 px-4">
                <PlateCard />
              </div>
              <MiniNav />
            </Phone>
          </Row>
        </Concept>

        {/* ── E ────────────────────────────────────────────────────────── */}
        <Concept
          letter="E"
          name="The first search is the tutorial"
          note="Stops explaining and puts them straight into the thing the product exists for — 'tell me what to order, right now, near me', which is PRODUCT.md's description of the job. Two taps of a real question, and what lands is not a slide but a plate they could go and order tonight. It teaches the filters by using them and it produces a result rather than a dismissal. The risk is that it reads as a form standing between you and the app, so the skip has to be as easy as the answer."
        >
          <Row>
            <Phone>
              <div className="px-5 pt-14">
                <p className="mono-label text-pm-orange-text">First things first</p>
                <h3 className="mt-1.5 font-display text-[26px] font-semibold leading-tight tracking-tight text-zinc-900">
                  What are you in the mood for?
                </h3>
                <p className="mt-1.5 text-[14px] leading-snug text-pm-grey-text">
                  Pick one and we&rsquo;ll show you what&rsquo;s good near you
                  right now. You can change it any time.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["Tacos", "Pizza", "Sushi", "Ramen", "Burgers", "Thai"].map((c, i) => (
                    <span
                      key={c}
                      className={`inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-medium ${
                        i === 0
                          ? "bg-pm-charcoal text-[#F7F4EC]"
                          : "bg-pm-grey-tint text-pm-grey-text"
                      }`}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="mt-6">
                  <span className="text-[13px] text-pm-grey-text underline">
                    Just show me the feed
                  </span>
                </p>
              </div>
              <div className="absolute inset-x-4 bottom-4">
                <Pill wide>
                  Show me tacos
                  <ChevronIcon className="ml-1 inline h-4 w-4" />
                </Pill>
              </div>
            </Phone>

            <Phone>
              <div className="px-4 pt-4">
                <p className="mono-label text-pm-orange-text">Tacos &middot; near you &middot; open now</p>
                <h3 className="mt-1.5 font-display text-[22px] font-semibold leading-tight tracking-tight text-zinc-900">
                  Start with this one
                </h3>
                <p className="mt-1 text-[13px] text-pm-grey-text">
                  Highest-rated plate within a mile that&rsquo;s still serving.
                </p>
              </div>
              {/* Tacos, because the question above asked for tacos. A demo
                  that answers "show me tacos" with a cheeseburger is arguing
                  against its own concept. */}
              <div className="mt-3 px-4">
                <PlateCard
                  text="Adobada off the trompo, not a steam tray. Ask for the red."
                  plate="Adobada taco · Tacos El Gordo"
                  score="96%"
                  tone="var(--pm-tone-1)"
                />
              </div>
              <div className="mt-3 px-4">
                <PlateCard
                  muted
                  text="The fish taco is the one to get here."
                  plate="Baja fish taco · Oscar's"
                  score="88%"
                  tone="var(--pm-tone-3)"
                />
              </div>
              <MiniNav />
            </Phone>
          </Row>
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
      <p className="mt-1 max-w-[78ch] text-[13px] leading-snug text-pm-grey-text">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The field the screens sit on.
 *
 * Tan rather than the page's own cream, because a cream screen on a cream page
 * has no edge — the first pass of this page rendered five phones you could not
 * find the boundaries of. Same white-on-cream grouping the app uses everywhere,
 * one level down: here the ground is the tan and the figure is the screen.
 */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 rounded-2xl bg-pm-grey-tint/60 p-4">{children}</div>
  );
}

/** A 390px screen on the app's own ground. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[620px] w-[390px] overflow-hidden rounded-2xl bg-[#F7F4EC]">
      {children}
    </div>
  );
}

/** One carousel screen: picture, one idea, dots, and a skip that never hides. */
function Slide({
  step,
  title,
  body,
  last = false,
  children,
}: {
  step: number;
  title: string;
  body: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex justify-end px-4 pt-4">
        <span className="mono-label text-pm-grey-text">{last ? "" : "Skip"}</span>
      </div>

      <div className="px-4 pt-6">{children}</div>

      <div className="px-6 pt-7">
        <h3 className="font-display text-[24px] font-semibold leading-tight tracking-tight text-zinc-900">
          {title}
        </h3>
        <p className="mt-2 text-[14px] leading-snug text-pm-grey-text">{body}</p>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-5 pb-5">
        <div className="flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-[5px] rounded-full ${
                n === step ? "w-5 bg-pm-orange" : "w-[5px] bg-pm-grey-tint"
              }`}
            />
          ))}
        </div>
        <span className="ml-auto">
          <Pill>
            {last ? "Start looking" : "Next"}
            {!last && <ChevronIcon className="ml-1 inline h-4 w-4" />}
          </Pill>
        </span>
      </div>
    </>
  );
}

/** B's caption: what the dimmed screen is pointing at. */
function Coach({
  bottom,
  step,
  title,
  body,
}: {
  bottom: number;
  step: number;
  title: string;
  body: string;
}) {
  return (
    <div className="absolute inset-x-4 z-20" style={{ bottom }}>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[15px] font-semibold text-zinc-900">{title}</p>
          <span className="font-mono text-[11px] tabular-nums text-zinc-500">{step} / 3</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-zinc-500">{body}</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="mono-label text-zinc-400">Skip</span>
          <span className="ml-auto mono-label text-pm-orange-text">Next</span>
        </div>
      </div>
    </div>
  );
}

/** C's rows: a mono position, a claim, a line of proof. */
function Line({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 font-mono text-[12px] tabular-nums text-pm-orange-text">{n}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-zinc-900">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-zinc-500">{body}</span>
      </span>
    </li>
  );
}

/** D's rows: a real thing to go and do, crossed out once it is done. */
function Task({ title, body, done = false }: { title: string; body: string; done?: boolean }) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
          done ? "bg-pm-orange text-white" : "bg-pm-grey-tint"
        }`}
      >
        {done && <CheckIcon className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[14px] font-semibold ${
            done ? "text-zinc-400 line-through" : "text-zinc-900"
          }`}
        >
          {title}
        </span>
        {!done && (
          <span className="mt-0.5 block text-[12px] leading-snug text-zinc-500">{body}</span>
        )}
      </span>
    </div>
  );
}

function Pill({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-pm-orange px-6 text-[14px] font-semibold text-[#F7F4EC] ${
        wide ? "w-full" : ""
      }`}
    >
      {children}
    </span>
  );
}

/* ── fragments of the real app, used as the tutorial's pictures ─────────── */

function PlateCard({
  muted = false,
  text = "The bacon is a woven mat, not three sad strips.",
  plate = "Double bacon cheeseburger · Hodad's",
  score = "93%",
  tone = "var(--pm-tone-2)",
}: {
  muted?: boolean;
  text?: string;
  plate?: string;
  score?: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-3 ${muted ? "opacity-60" : ""}`}>
      <div className="h-[150px] rounded-xl" style={{ background: tone }} />
      <p className="mt-2.5 font-display text-[15px] font-semibold leading-snug text-zinc-900">
        {text}
      </p>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-[11px] text-zinc-500">{plate}</span>
        <span className="font-mono text-[15px] font-semibold tabular-nums text-pm-orange">
          {score}
        </span>
      </div>
    </div>
  );
}

/** The map keeps its night style — a confirmed exception, per AGENTS.md. */
function MapBlock() {
  return (
    <div className="relative h-[190px] overflow-hidden rounded-2xl bg-[#14120f]">
      {[
        { top: 40, left: 60, size: 12 },
        { top: 96, left: 150, size: 20 },
        { top: 62, left: 250, size: 9 },
        { top: 140, left: 96, size: 14 },
        { top: 128, left: 268, size: 11 },
      ].map((p) => (
        <span
          key={`${p.top}-${p.left}`}
          className="absolute rounded-full bg-pm-orange"
          style={{
            top: p.top,
            left: p.left,
            height: p.size,
            width: p.size,
            filter: "blur(1px)",
            opacity: 0.85,
          }}
        />
      ))}
      <span className="absolute bottom-3 left-3 mono-label text-white/50">North Park</span>
    </div>
  );
}

function ComposerBlock() {
  return (
    <div className="rounded-2xl bg-pm-charcoal p-3">
      <div className="h-[128px] rounded-xl bg-black/40" />
      <div className="mt-3 flex items-center justify-center">
        <span className="h-11 w-11 rounded-full bg-[var(--pm-tone-1)]" />
      </div>
    </div>
  );
}

/** Enough of the feed to be dimmed behind a coach mark. */
function MiniFeed({ dim = false }: { dim?: boolean }) {
  return (
    <>
      <div className="px-4 pt-4">
        <p className="font-display text-[22px] font-semibold tracking-tight text-zinc-900">
          Food Feed
        </p>
        <p className="mt-0.5 text-[12px] text-pm-grey-text">
          See what people around you are eating
        </p>
      </div>
      <div className="mt-3 px-4">
        <PlateCard />
      </div>
      {dim && <div className="absolute inset-0 z-10 bg-pm-charcoal/65" />}
    </>
  );
}

/**
 * The phone nav.
 *
 * Deliberately *below* the scrim (no z of its own), so a dimmed screen dims the
 * nav too. `highlight` then re-draws one control on top at z-20 — the marked
 * thing is lit because it is the only thing above the dim, not because
 * something was drawn around it.
 */
function MiniNav({ highlight }: { highlight?: "plus" }) {
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-around bg-[#F7F4EC] px-4 pb-3 pt-2">
        <NavItem icon={<HomeIcon className="h-5 w-5" />} label="Feed" current />
        <NavItem icon={<CompassIcon className="h-5 w-5" />} label="Discover" />
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC]">
          <PlusIcon className="h-5 w-5" />
        </span>
        <NavItem icon={<UsersIcon className="h-5 w-5" />} label="Friends" />
        <NavItem icon={<UserIcon className="h-5 w-5" />} label="Profile" />
      </div>

      {highlight === "plus" && (
        <span className="absolute bottom-[14px] left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-pm-orange text-[#F7F4EC]">
          <PlusIcon className="h-5 w-5" />
        </span>
      )}
    </>
  );
}

function NavItem({
  icon,
  label,
  current = false,
}: {
  icon: React.ReactNode;
  label: string;
  current?: boolean;
}) {
  return (
    <span
      className={`flex flex-col items-center gap-1 ${
        current ? "text-pm-orange-text" : "text-pm-grey-text"
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </span>
  );
}
