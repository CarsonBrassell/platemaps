/*
 * The 79/91 note called both counts artefacts outright. Measurement since says
 * they are a reason to look, not a verdict: re-reading all 62 marketplace
 * menus sitting on those counts found five truncated and three that came back
 * at exactly their stored size with the page's own menu book agreeing.
 */
import fs from "fs";

const P = "probe/AGENT-BRIEF.md";
let t = fs.readFileSync(P, "utf8");

if (t.includes("a reason to check, not a verdict")) {
  console.log("REFUSING: already corrected");
  process.exit(1);
}

const FROM = `**Two dish counts in this corpus are extraction artefacts, not menus: 79 and
91.** Across 363 DoorDash menus already filed,`;

const TO = `**Two dish counts are where truncated captures pile up: 79 and 91 - a reason to
check, not a verdict.** Across 363 DoorDash menus already filed,`;

const n = t.split(FROM).length - 1;
if (n !== 1) {
  console.log(`REFUSING: expected 1 occurrence of the header, found ${n}`);
  process.exit(1);
}
t = t.replace(FROM, TO);

/* The measured result goes right before the instruction it qualifies. */
const ANCHOR = `If your count lands on 79 or 91, treat the capture as
truncated until you have confirmed otherwise:`;
if (!t.includes(ANCHOR)) {
  console.log("REFUSING: instruction anchor not found");
  process.exit(1);
}

const ADD = `The router now runs this check itself: it compares its read against the menu
book in the same page body - the list the rendered category nav is drawn from -
and refuses a read that is missing a section the book advertises. Re-reading
every marketplace menu on 79 or 91 through that check found five genuinely
truncated and three that came back at exactly their stored size with the book
agreeing, so a count on those numbers is not on its own a fault. Seven others
recovered outright, 553 dishes becoming 1118 - Sapporo Sushi 79 to 238, Baci
Coffee 79 to 278.

`;

t = t.replace(ANCHOR, ADD + ANCHOR);
fs.writeFileSync(P, t);
console.log("corrected the 79/91 note");
