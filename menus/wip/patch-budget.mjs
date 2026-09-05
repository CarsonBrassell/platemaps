/*
 * Calvin bought a 50,000-credit Serper pack on 2026-09-04. The ledger is a
 * cumulative count of every call ever made, so the cap has to be cumulative
 * too: 2,720 already on the ledger from the free tier plus the 50,000 paid
 * for is 52,720, which leaves exactly the pack available and not a credit
 * more. `--max-queries` still defaults to 0, so a bare run remains a no-op.
 */
import fs from "fs";
const P = "scripts/find-websites.mjs";
let t = fs.readFileSync(P, "utf8");

const FROM = `/** Serper's free tier is 2,500 one-time. Stop with a margin, never buy a pack. */
const BUDGET = 2400;`;
const TO = `/**
 * The ledger counts every call ever made, so this cap is cumulative, not
 * per-run: 2,720 spent off the free tier plus the 50,000-credit pack bought
 * 2026-09-04 is 52,720. Raise it only by what has actually been purchased.
 */
const BUDGET = 52720;`;

const n = t.split(FROM).length - 1;
if (n !== 1) {
  console.log("REFUSING: expected 1 occurrence of the budget block, found " + n);
  process.exit(1);
}
fs.writeFileSync(P, t.replace(FROM, TO));
console.log("BUDGET 2400 -> 52720");
