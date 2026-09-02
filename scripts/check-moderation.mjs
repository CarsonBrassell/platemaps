/*
 * Asserts the content filter still does what it claims.
 *
 *   npm run moderation:check
 *
 * There is no test framework in this project, so this is the shape the repo
 * already uses for a checkable invariant (see aspects:preview): a script that
 * prints a table and exits non-zero when something regressed.
 *
 * **The `allow` half is the half that matters.** Blocking a slur is easy and
 * stays working; not eating "spicy" is what breaks silently when someone adds
 * a term, and nobody notices until a real review has vanished. Run this after
 * every edit to BLOCK_TERMS or REVIEW_TERMS.
 */
import { moderateText, MODERATION_CASES } from "../src/lib/moderation.ts";

let failed = 0;
for (const testCase of MODERATION_CASES) {
  const got = moderateText(testCase.text).action;
  const ok = got === testCase.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${JSON.stringify(testCase.text).padEnd(28)} expect ${testCase.expect.padEnd(6)} got ${got}`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} of ${MODERATION_CASES.length} moderation cases failing.`);
  process.exit(1);
}
console.log(`\nAll ${MODERATION_CASES.length} moderation cases pass.`);
