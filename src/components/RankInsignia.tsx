import { rankByKey, type RankKey } from "@/lib/ranks";

/**
 * The rank crest — a plate that gains cutlery, then stars, then a laurel as the
 * ladder in `lib/ranks.ts` is climbed. Six drawings, one 100×100 grid.
 *
 * The six share three marks (the plate, the crossed cutlery, the star), and the
 * obvious way to share them in SVG is `<defs>` plus `<use href="#…">`. That is
 * how the source artwork was drawn and it is deliberately **not** what this
 * file does: ids are document-global, so the moment two badges are mounted at
 * once — a profile beside anything else that ever renders one — the second
 * copy's `<use>` resolves against the first copy's `<defs>`. Sharing happens in
 * React instead, as the sub-components below, and every instance carries its
 * own geometry. The coordinates are the artwork's, untouched, which is why the
 * marks are positioned by `translate → scale → translate` back off their own
 * centre rather than being redrawn where they land.
 *
 * Colour comes from the tokens in `globals.css`, never from the hexes the
 * artwork was drawn with: `currentColor` is the cutlery ink (`--pm-grey-text`,
 * set on the root `<svg>`, the same trick the source used with `style="color:"`
 * on each `<use>`), the plate ring is `--pm-grey-tint`, the laurel is the
 * `zinc-400` step, and the stars and the Institution banner are the one accent.
 * The plate's face is flat white because it is a *plate*, not a card.
 */

/** Drawn where a Regular's single star sits, so callers undo (50, 15.8). */
const STAR_PATH = "M50 8l2.5 5.1 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z";

type Placed = { x: number; y: number; scale: number };

function Star({ x, y, scale }: Placed) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) translate(-50 -15.8)`}>
      <path d={STAR_PATH} fill="var(--pm-orange)" />
    </g>
  );
}

/** Fork and knife rotated 30° either side of a shared centre at (50, 52). */
function CrossedCutlery({ x, y, scale }: Placed) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) translate(-50 -52)`} fill="currentColor">
      <g transform="rotate(-30 50 52)">
        <rect x="47.5" y="24" width="5" height="32" rx="2.5" />
        <rect x="43" y="18" width="3.2" height="13" rx="1.6" />
        <rect x="48.4" y="17" width="3.2" height="14" rx="1.6" />
        <rect x="53.8" y="18" width="3.2" height="13" rx="1.6" />
        <rect x="47.5" y="56" width="5" height="26" rx="2.5" />
      </g>
      <g transform="rotate(30 50 52)">
        <path d="M46.6 18c6.8 4 7.8 15.4 3.4 23h-3.4z" />
        <rect x="46.6" y="41" width="4.8" height="41" rx="2.4" />
      </g>
    </g>
  );
}

/**
 * The plate shrinks as the wreath around it grows, and the face is *not* a
 * fixed fraction of the rim — the ring has to stay readable at 64px, so the
 * three sizes were drawn rather than derived. Both radii are passed for that
 * reason.
 */
function Plate({ cy, r, faceR }: { cy: number; r: number; faceR: number }) {
  return (
    <>
      <circle cx="50" cy={cy} r={r} fill="var(--pm-grey-tint)" />
      <circle cx="50" cy={cy} r={faceR} fill="#ffffff" />
    </>
  );
}

/** Critic's wreath: two arcs sweeping up from the base, open at the top. */
function LaurelHalf() {
  return (
    <g className="text-zinc-400">
      <g stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M44 88c-13-3.4-21-12-22.5-24" />
        <path d="M56 88c13-3.4 21-12 22.5-24" />
      </g>
      <g fill="currentColor">
        <ellipse cx="23" cy="60" rx="2.5" ry="5" transform="rotate(-80 23 60)" />
        <ellipse cx="25" cy="70" rx="2.5" ry="5" transform="rotate(-58 25 70)" />
        <ellipse cx="30.5" cy="79" rx="2.5" ry="5" transform="rotate(-38 30.5 79)" />
        <ellipse cx="38.5" cy="84.5" rx="2.5" ry="5" transform="rotate(-16 38.5 84.5)" />
        <ellipse cx="77" cy="60" rx="2.5" ry="5" transform="rotate(80 77 60)" />
        <ellipse cx="75" cy="70" rx="2.5" ry="5" transform="rotate(58 75 70)" />
        <ellipse cx="69.5" cy="79" rx="2.5" ry="5" transform="rotate(38 69.5 79)" />
        <ellipse cx="61.5" cy="84.5" rx="2.5" ry="5" transform="rotate(16 61.5 84.5)" />
      </g>
    </g>
  );
}

/**
 * Institution's wreath is a second drawing, not the half one scaled up: it
 * closes further round the plate, carries twelve leaves instead of eight, and
 * takes a heavier stroke so it still reads once the whole group is at 0.82.
 */
function LaurelFull() {
  return (
    <g className="text-zinc-400" transform="translate(50 63) scale(0.82) translate(-50 -61)">
      <g stroke="currentColor" strokeWidth="2.9" fill="none" strokeLinecap="round">
        <path d="M44 88c-16-4-25-16-24-33 .5-9 4-16 10-21" />
        <path d="M56 88c16-4 25-16 24-33-.5-9-4-16-10-21" />
      </g>
      <g fill="currentColor">
        <ellipse cx="29" cy="36" rx="3" ry="6" transform="rotate(-118 29 36)" />
        <ellipse cx="24" cy="45" rx="3" ry="6" transform="rotate(-95 24 45)" />
        <ellipse cx="22" cy="55" rx="3" ry="6" transform="rotate(-76 22 55)" />
        <ellipse cx="24" cy="66" rx="3" ry="6" transform="rotate(-56 24 66)" />
        <ellipse cx="29.5" cy="76" rx="3" ry="6" transform="rotate(-38 29.5 76)" />
        <ellipse cx="37.5" cy="83" rx="3" ry="6" transform="rotate(-18 37.5 83)" />
        <ellipse cx="71" cy="36" rx="3" ry="6" transform="rotate(118 71 36)" />
        <ellipse cx="76" cy="45" rx="3" ry="6" transform="rotate(95 76 45)" />
        <ellipse cx="78" cy="55" rx="3" ry="6" transform="rotate(76 78 55)" />
        <ellipse cx="76" cy="66" rx="3" ry="6" transform="rotate(56 76 66)" />
        <ellipse cx="70.5" cy="76" rx="3" ry="6" transform="rotate(38 70.5 76)" />
        <ellipse cx="62.5" cy="83" rx="3" ry="6" transform="rotate(18 62.5 83)" />
      </g>
    </g>
  );
}

/**
 * Painting order is the drawing order: wreath and stars go down first so the
 * plate lands on top of them and the crest reads as one object rather than as a
 * plate with decoration parked behind it.
 */
function Mark({ rank }: { rank: RankKey }) {
  switch (rank) {
    case "newcomer":
      // A bare plate. Nothing has happened yet, and the badge says so.
      return <Plate cy={57} r={23} faceR={16} />;
    case "taster":
      return (
        <>
          <Plate cy={57} r={23} faceR={16} />
          <CrossedCutlery x={50} y={57} scale={0.76} />
        </>
      );
    case "regular":
      return (
        <>
          <Plate cy={57} r={23} faceR={16} />
          <CrossedCutlery x={50} y={57} scale={0.76} />
          <Star x={50} y={15} scale={0.7} />
        </>
      );
    case "local":
      return (
        <>
          <Plate cy={57} r={23} faceR={16} />
          <CrossedCutlery x={50} y={57} scale={0.76} />
          <Star x={41} y={16} scale={0.7} />
          <Star x={59} y={16} scale={0.7} />
        </>
      );
    case "critic":
      return (
        <>
          <Star x={34} y={17} scale={0.55} />
          <Star x={50} y={11} scale={0.55} />
          <Star x={66} y={17} scale={0.55} />
          <LaurelHalf />
          <Plate cy={52} r={18} faceR={12.5} />
          <CrossedCutlery x={50} y={52} scale={0.58} />
        </>
      );
    case "institution":
      return (
        <>
          <Star x={32} y={17} scale={0.5} />
          <Star x={41} y={12} scale={0.5} />
          <Star x={50} y={9} scale={0.5} />
          <Star x={59} y={12} scale={0.5} />
          <Star x={68} y={17} scale={0.5} />
          <LaurelFull />
          <Plate cy={62} r={15} faceR={10.5} />
          <CrossedCutlery x={50} y={62} scale={0.5} />
          {/* The banner closing the wreath. The crest's only other accent. */}
          <path
            d="M40 92h20"
            fill="none"
            stroke="var(--pm-orange)"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </>
      );
  }
}

export function RankInsignia({
  rank,
  size = 76,
  showCard = false,
  className = "",
}: {
  rank: RankKey;
  /** Rendered edge length in px. It is a crest, not an icon — don't go small. */
  size?: number;
  /**
   * The rounded white plaque the mark was drawn sitting on. Off by default:
   * every surface that shows this today is already a white card, where the
   * plaque is an invisible square that only steals 4px of margin from the
   * wreath. Turn it on to put the crest on cream or on a photo.
   */
  showCard?: boolean;
  className?: string;
}) {
  const { title } = rankByKey(rank);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${title} rank`}
      className={`text-pm-grey-text ${className}`}
    >
      {showCard ? <rect x="2" y="2" width="96" height="96" rx="14" fill="#ffffff" /> : null}
      <Mark rank={rank} />
    </svg>
  );
}
