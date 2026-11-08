/**
 * A For me reason line: prose with its numbers set in mono. "Fits your usual
 * $11–18 plate" keeps its sans and gives the dollar range the tabular mono every
 * other number in the app wears; a distance ("0.4 mi") and a plain numeral
 * ("Pho 79") do the same. The caller sets size, colour and spacing, since the
 * phone grid and the web card differ in all three.
 */
const NUMBER =
  /(\$\d[\d,]*(?:\.\d+)?(?:[–-]\$?\d[\d,]*(?:\.\d+)?)?|\d[\d,]*(?:\.\d+)?(?:\s?mi\b)?)/;

export function ReasonText({ text }: { text: string }) {
  // One capture group, so split puts the numbers at the odd positions.
  return (
    <>
      {text.split(NUMBER).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono tabular-nums">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
