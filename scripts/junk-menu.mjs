/**
 * "These rows are not dishes" - the one test every menu writer shares.
 *
 * On 2026-09-13 Em Coffee House's menu read color_3 $1.00, color_4 $88.00,
 * color_11 $52329.00: a Wix theme palette (siteassets.parastorage.com) that
 * the browser tier captured as the page's largest priced JSON payload. Sixteen
 * more restaurants carried DoorDash's feature-flag service the same way
 * (enable_dish_leaderboard $3.00). 142 restaurants in all, every one filed as
 * `high` confidence, every one live - two payloads that are shaped like a
 * catalog and contain no food.
 *
 * Two independent checks, because each alone has a hole:
 *
 * - **Host.** Asset and config CDNs never carry a menu, whatever the payload
 *   looks like. Matched on the capture URL, so the browser tier drops the
 *   response before it can win the size contest.
 * - **Shape.** A menu written by a person has names with spaces and prices
 *   under a thousand dollars. Identifier names (`color_11`, `cx_web_vogue`) and
 *   five-digit prices are machine state. Thresholds are fractions of the entry,
 *   so one "Combo_2" or one $1,200 catering tray does not fail a real menu.
 *
 * Applied in three places on purpose - browser-menus.mjs (before a payload can
 * be chosen), screen-menus.mjs (before a file can be released), load-menus.mjs
 * (before a row can be written) - because the files that carried these were
 * hand-checked at none of them.
 */

export const INFRASTRUCTURE_HOSTS = [
  /(^|.)parastorage.com$/i, // Wix site assets and theme JSON
  /^dynamic-values-edge-service.doordash.com$/i, // DoorDash experiment flags
  /(^|.)gstatic.com$/i,
  /^fonts.googleapis.com$/i,
  /* NOT static.wixstatic.com: three real menus (Choi's, La Dolce Vita, Luce)
   * were read off menu photos hosted there. A media CDN can carry a menu; a
   * theme/config CDN cannot. */
];

const IDENT_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; // color_11, cx_web_vogue_mobile
/* Any script's letters, not Latin's: a menu written in Arabic or Chinese has
 * names, and `[A-Za-z]` would have called Royal Sweets' whole list letterless. */
const NO_LETTERS = /^[^\p{L}]*$/u;

export const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Why these rows cannot be a menu, or null when they might be. */
export function junkReason(dishes, host = "") {
  if (host && INFRASTRUCTURE_HOSTS.some((re) => re.test(host))) return `infrastructure host, not a storefront (${host})`;
  const rows = dishes ?? [];
  if (!rows.length) return null;
  let ident = 0;
  let noLetters = 0;
  let bigPrice = 0;
  for (const d of rows) {
    const name = String(d?.name ?? "").trim();
    if (IDENT_NAME.test(name)) ident += 1;
    else if (NO_LETTERS.test(name)) noLetters += 1;
    const n = parseFloat(String(d?.price ?? "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n >= 1000) bigPrice += 1;
  }
  const n = rows.length;
  if (ident / n >= 0.3) return `${ident} of ${n} names are identifiers (color_11, enable_x) - a config payload, not a menu`;
  if (bigPrice / n >= 0.1) return `${bigPrice} of ${n} prices are $1,000 or more - not menu prices`;
  if (noLetters / n >= 0.3) return `${noLetters} of ${n} names contain no letters`;
  return null;
}
