import { BrandMark } from "@/components/BrandMark";
import { initials } from "@/lib/format";

/**
 * The Friends screen's head, and the one filled shape on it.
 *
 * The screen used to open with a bare `h1` on the cream, which made it the
 * only phone screen with no visual entry point at all. This is an orange
 * card instead — deliberately the single biggest spend of the accent in the
 * app, because DESIGN.md's "about three orange elements per screen" budget
 * is about not *scattering* it. One card, then the rest of the screen stays
 * white-on-cream exactly as before.
 *
 * It extends the metaphor `PhoneFriendsLeaderboard` already established — the
 * leaderboard is a printed menu, this is the table it sits on, hence the
 * eyebrow and the stack of faces. That is also why the copy never counts
 * anybody: friend counts never display in this product (see the header
 * comment on PhoneFriendsScreen), so the faces are shown *as faces*, capped,
 * with no "+3 more" and no total anywhere. A cap of five is a layout
 * decision — five 36px discs at an 8px overlap is 148px, which fits the card
 * with room to spare on a 390px screen.
 *
 * Contrast, because cream on orange is 3.87:1 and that is a large-text-only
 * pairing:
 * - the title is 26px display and the subtitle is 14px medium, which is the
 *   floor DESIGN.md names for this pairing;
 * - the eyebrow is label-sized, which that pairing may never hold, so it
 *   inverts — a cream pill with `--pm-orange-text` on it (5.8:1) rather than
 *   cream type sitting straight on the fill.
 *
 * The pin gets the same treatment for the same reason: `logo-mark.png` is
 * mostly orange line-work and would half-disappear on an orange ground, so it
 * sits in a cream disc, which is how it reads everywhere else in the product.
 */

type Face = { id: string; name: string; avatarUrl?: string };

/** Five is the layout cap, not a fact about anyone's friends. */
const FACES_SHOWN = 5;

/**
 * The ring takes the *card's* colour, not the disc's: cream on cream fused the
 * row into one blob with no edge between neighbours. Orange rings are the gap.
 * Size and overlap are paired to the initials — 36px discs at an 8px overlap
 * leave 28px of every disc showing, which clears two centred characters; the
 * first pass (32px at 10px) cut the second letter of every fallback in half.
 */
function StackedFace({ face }: { face: Face }) {
  const ring = "h-9 w-9 shrink-0 rounded-full ring-2 ring-pm-orange";
  if (face.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={face.avatarUrl} alt="" className={`${ring} object-cover`} />;
  }
  return (
    <span
      className={`${ring} flex items-center justify-center bg-[#F7F4EC] font-mono text-[11px] font-medium text-pm-orange-text`}
    >
      {initials(face.name)}
    </span>
  );
}

export function PhoneFriendsHero({ friends }: { friends: Face[] | null }) {
  const faces = friends?.slice(0, FACES_SHOWN) ?? [];

  return (
    <div className="mx-4 mb-6 mt-4 rounded-2xl bg-pm-orange px-5 pb-5 pt-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="mono-label inline-flex items-center rounded-full bg-[#F7F4EC] px-2.5 py-1 text-pm-orange-text">
            Your table
          </span>
          <h1 className="font-display mt-2.5 text-[26px] font-semibold leading-tight tracking-tight text-[#F7F4EC]">
            Friends
          </h1>
          <p className="mt-1 text-[14px] font-medium leading-snug text-[#F7F4EC]">
            The people you eat with. Their plates land in your Friend feed.
          </p>
        </div>

        {/* Cream disc so the pin's orange line-work has something to sit on. */}
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F7F4EC]">
          <BrandMark className="h-9 w-auto" />
        </span>
      </div>

      {faces.length > 0 && (
        <div className="mt-4 flex items-center">
          {/* Faces only — no tally, by the rule in PhoneFriendsScreen's header. */}
          <span className="flex" aria-hidden="true">
            {faces.map((face, i) => (
              <span key={face.id} className={i === 0 ? "" : "-ml-2"}>
                <StackedFace face={face} />
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
