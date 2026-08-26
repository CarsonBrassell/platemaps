/**
 * Splits extracted menu files into what may be loaded and what must not be.
 *
 *   node scripts/screen-menus.mjs menus/wip/result-*.json
 *
 * Writes `menus/wip/clean.json` (safe to hand to load-menus.mjs) and
 * `menus/wip/quarantine.json` (re-extract these), and prints why each entry
 * landed where it did.
 *
 * ## Why this exists
 *
 * Extraction agents fall back to search when a restaurant's own site is
 * JS-rendered, and what ranks for "<brand> menu prices" is largely SEO content
 * farms. The Aug 23 wave proved the cost concretely: one agent read Dave's Hot
 * Chicken off `daveshotchicken.us` (a brand-twin of the real `.com`) and got 47
 * dishes; another read the official site and got 110. The farm was not merely
 * thinner, it was a different menu.
 *
 * Content farms mix real prices with invented ones - the Costco entry from an
 * agency blog had genuinely correct hot dog and pizza prices sitting beside
 * unverifiable ones - so spot-checking a value proves nothing about its
 * neighbours. The only safe treatment is the source, not the number.
 *
 * Nothing here deletes anything. Quarantine is a queue for re-extraction with
 * the source ladder in probe/FINDINGS.md applied harder, not a bin.
 */

import { readFile, writeFile } from "node:fs/promises";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("Usage: node scripts/screen-menus.mjs menus/wip/result-*.json");
  process.exit(1);
}

/*
 * Sources barred outright, which no amount of cross-checking rescues.
 *
 * Yelp's menu tab is the one that matters. It was a hard reject in every
 * extraction brief from the first wave onward and was still never checked here,
 * so the ban held only as long as every agent obeyed it. One did not: it read
 * Swami's Cafe off Yelp after the restaurant's own Popmenu site failed to
 * render, and argued the prices were sound because they sat below Postmates'
 * by the usual delivery multiple.
 *
 * The argument is a good one aimed at the wrong target. Yelp's menu tab is
 * barred for being *stale* - user-submitted, undated, sometimes years old - not
 * for being marked up. Confirming it is cheaper than a delivery app confirms
 * nothing about when it was written. A rule worth stating in a prompt is worth
 * enforcing in code, because a prompt is advice and this is not.
 */
const BARRED = [/(^|\.)yelp\.com$/i, /(^|\.)yelp\.[a-z.]+$/i];

/** Hosts that are never a primary source, whatever the agent's confidence. */
const UNTRUSTED = [
  /(^|\.)menupedia\./i,
  /(^|\.)allmenus\.com$/i,
  /mojosalesandbranding\.com$/i,
  /(^|\.)menuswithprice\./i,
  /(^|\.)pricelisto\./i,
  /(^|\.)menuandprice/i,
  // Named in this file's own source ranking as "frequently stale", and it was
  // missing here — so an agent that cross-checked allmenus against it read as
  // corroborated when it had asked two aggregators the same question. It is a
  // tier-5 source like the others, not a check on one.
  /(^|\.)restaurantguru\.com$/i,
  /(^|\.)beyondmenu\.com$/i,
];

/*
 * Ordering platforms restaurants genuinely use, checked before the TLD rule
 * below. `order.online` ends in `.online` and would otherwise be read as a
 * squatted domain, but it is the white-label storefront a great many
 * restaurants link to from their own site - tier 3 in the ladder, allowed once
 * the extracting agent has run the markup check on it. Losing it would throw
 * away the only priced source a lot of small restaurants have.
 */
const PLATFORM = [
  /(^|\.)order\.online$/i,
  /(^|\.)toasttab\.com$/i,
  // Toast also serves restaurant storefronts under `<name>.toast.site`, which
  // the brand-twin rule below reads as a squat. Same platform, second domain.
  /(^|\.)toast\.site$/i,
  /(^|\.)chownow\.com$/i,
  /(^|\.)yourmenu\.com$/i,
  /(^|\.)popmenu\.com$/i,
  /(^|\.)singleplatform\.com$/i,
  /(^|\.)clover\.com$/i,
  /(^|\.)square(up)?\.(com|site)$/i,

  /*
   * Menu-hosting domains verified as belonging to the restaurant.
   *
   * `kingsmenu.site` reads exactly like a squatted brand-twin - a chain's name
   * under `.site` - and the rule below flagged it. It is genuinely King's Fish
   * House's own menu host, linked from `kingsfishhouse.com`, serving a
   * per-location PDF regenerated daily.
   *
   * The check that settles these is cheap and should be the habit: fetch the
   * restaurant's real homepage and see whether it links to the domain in
   * question. A squatter is never linked to by the business it imitates. The
   * heuristic is right often enough to keep and wrong often enough to verify.
   */
  /(^|\.)kingsmenu\.site$/i,

  /*
   * `olivecafe.biz` is Olive Cafe's own primary domain - a small Mission Beach
   * cafe on a cheap TLD, not an imitation of anything.
   *
   * This is a second, different way the brand-twin rule misfires, and it is
   * worth separating from the King's Fish House case. That one was a real chain
   * whose menu host merely looked like a squat. This one shows the rule's
   * unstated premise: squatting requires a brand worth squatting on. A
   * `.biz`/`.site` under a national chain's name is almost always theft; the
   * same TLD under an independent cafe's name is just what the owner could
   * afford in 2009.
   *
   * So weigh the pattern by whether the name is a chain. For an independent,
   * fetch it and look: a real site serves the restaurant's own pages, and a
   * squat redirects or serves filler.
   */
  /(^|\.)olivecafe\.biz$/i,

  /*
   * Mike's BBQ in Escondido, on `.us`. Verified in a real browser: the site
   * carries their branding, menus, reservations, catering and a hiring popup.
   *
   * Worth recording how it nearly went the other way. `curl` got a 403 and a
   * "Just a moment…" page, which is Cloudflare challenging a scripted client -
   * and at a glance that is not far from what a parked scam domain looks like.
   * The 403 is evidence about the client, not the site. Chrome loaded it fine.
   *
   * Fourth false positive from the brand-twin rule (see BRAND_TWIN below). Every
   * one has been a real restaurant, and the rule has caught three real squats.
   */
  /(^|\.)mikesbbq\.us$/i,
];

/*
 * A brand name under an alternate TLD is often squatting. `daveshotchicken.us`
 * is not a regional arm of `daveshotchicken.com`; it is a farm renting the
 * recognition.
 *
 * **Its accuracy is poor and it should be treated as a prompt to check, not a
 * verdict.** Tally after four waves - true: `daveshotchicken.us`,
 * `sonic-...hub.biz`, `wnam-cdn.menuweb.menu`. False: `kingsmenu.site` (King's
 * Fish House's own menu host), `olivecafe.biz` (an independent's own domain),
 * `sandiegobobateacafe.toast.site` (Toast's platform). Three of seven wrong,
 * and each false positive withheld a complete first-party menu.
 *
 * The TLD is not what makes a squat. Two things do, and both are cheap to test:
 * the name belongs to a **chain** recognisable enough to be worth imitating,
 * and the business's **real homepage does not link to the domain**. An
 * independent cafe on a cheap TLD is imitating nobody.
 *
 * So a hit here means fetch the official site and look, and add the domain to
 * PLATFORM above once it checks out. Restricted to the TLDs actually seen doing
 * it - matching every non-.com would catch legitimate `.co.uk`-style sites.
 */
const BRAND_TWIN = /\.(us|info|biz|site|online|store|menu)$/i;

/** Below this, a claimed menu is a partial capture, not a small menu. */
const THIN = 8;

/*
 * Restaurants whose whole menu is genuinely shorter than THIN.
 *
 * All-you-can-eat and buffet formats do not have dishes with prices; they have
 * three to six price tiers - lunch, dinner, weekend, kids - and that IS the
 * menu. Shabumi's five lines (AYCE hot pot, Korean BBQ, soft drinks) are its
 * complete published pricing, and Super China Buffet's three are too.
 *
 * The thin-capture rule exists to catch a fragment of a long menu, and it
 * cannot tell that from a short one that is whole. It has now rejected several
 * of these, each time correctly by its own logic and wrongly in fact. Listing
 * them by id is the honest fix: a threshold cannot know the difference, and a
 * person reading the agent's report can.
 *
 * The general repair is for extractions to declare the menu's shape rather than
 * leaving the count to imply it - a buffet is a different kind of thing from a
 * taqueria with four items, and only the extractor knows which it is looking at.
 */
const COMPLETE_BUT_SHORT = new Set([
  "403", // Super China Buffet - 3 tiers
  "1658", // Shabumi - 5 tiers, AYCE hot pot and Korean BBQ
  "313", // Little Sakana - 5 tiers, AYCE sushi
  "2038", // Cinnabon - rolls, CinnaPacks and drinks IS the whole catalogue
  "2108", // Golden Spoon - frozen yoghurt, dessert-only, complete at 7
]);

/*
 * Partial captures the dish count cannot catch.
 *
 * A thin menu and a truncated one look identical in the JSON: 18 dishes is a
 * whole menu at a taqueria and two sections out of nine at Claim Jumper, whose
 * page paginates on scroll and whose extraction was cut short when a sibling
 * agent navigated the shared Chrome tab away. The agent said so in its report,
 * but a report is prose and this file reads JSON, so the knowledge has to be
 * written down somewhere to survive.
 *
 * Keyed by name because a truncated capture is about the extraction attempt,
 * not the restaurant - the row is fine, the read of it was not. Entries come
 * off this list once a clean re-extraction replaces them.
 */
const KNOWN_PARTIAL = new Set();

/*
 * Menus where the agent derived prices rather than reading them.
 *
 * Panda Express prices by tier - every standard entrée costs the same, every
 * premium entrée costs the same - so an agent that read two prices and applied
 * them across the tier produced a menu that is very likely correct. Very likely
 * is not the standard for a price. The reasoning was sound and the agent said
 * plainly what it had done, which is why this is a hold rather than a rejection:
 * a re-read that clicks each item either confirms it in minutes or catches the
 * one entrée that breaks the pattern.
 */
const INFERRED_PRICING = new Set();

/*
 * Individual extractions to hold, keyed by restaurant id.
 *
 * The name-keyed sets above cannot express these: three of the rows here are
 * Jack in the Box and McDonald's branches whose *siblings* in the same file are
 * fine, and quarantining by name would throw away the good extraction along
 * with the bad one.
 *
 *   4678, 4861 - Jack in the Box. The agent pulled one branch's menu in full
 *     (4664, 142 items) and then wrote a 41-item subset of that same menu under
 *     these two ids, reasoning that JITB prices are standard within a metro.
 *     The reasoning is probably right and the mechanism is still wrong: this
 *     arrives looking like an independent read of each branch when it is one
 *     read copied twice. share-chain-menus.mjs exists to do exactly this job
 *     honestly - it marks what it copies `chain-shared` and records which
 *     branch it came from - so let it, and keep 4664.
 *
 *   4684 - McDonald's via DoorDash. The markup test came back mixed: some items
 *     divide cleanly by 1.1 and most do not. A mixed signal is not a pass, and
 *     McDonald's delivery pricing is widely marked up. 87 items is a lot to
 *     leave on the table for a chain that has been not-found three times, which
 *     is precisely the pressure that gets a bad price published.
 *
 *   1717 - Pizzeria Luigi. 28 of roughly 40 items; the rest never rendered on a
 *     contended Chrome. Above the THIN threshold but partial by the agent's own
 *     account.
 */
/*
 *   5675 - The Yellow Deli, read off allmenus and cross-checked against a San
 *     Diego Reader article from 2020. Two of three spot-checked prices matched
 *     exactly, which the agent honestly flagged as its weakest capture.
 *
 *     The match is the problem, not the reassurance. Cross-checking a tier-5
 *     source against a six-year-old article cannot show the prices are current;
 *     an exact match with 2020 says the aggregator is repeating 2020. The
 *     ladder's "two independent sources agree" was written to catch invention,
 *     and agreement does nothing about age - Rainbow Oaks' SinglePlatform entry
 *     was internally consistent too, at roughly half today's prices.
 *
 *     A cross-check is only worth what its freshest source is worth.
 */
/*
 *   5413 - Popeyes. 16 items for a chain carrying roughly three times that. The
 *     agent said plainly it was thin because pricing needed a modal click per
 *     item on a slow SPA while three siblings fought it for the browser. A
 *     capture limited by contention rather than by the menu is a partial, and
 *     it re-queues for a quieter run.
 *
 * Panda Express came *off* the inferred-pricing hold in the same pass. It was
 * held when two sampled prices were spread across a tier; it came back with
 * four samples in each of two tiers, both consistent, which establishes the
 * tier structure rather than assuming it. Panda genuinely prices this way, so
 * the sampling is a measurement now, not a guess.
 *
 *   5421 - Sarita's Taco Shop. 25 items, which clears the thin-capture floor,
 *     but the agent said what they were: DoorDash's "Most Ordered" cross-
 *     section, not the menu. Their own site publishes the menu as unreadable
 *     images and a NetWaiter listing carried $3.49 burritos, plainly years old.
 *     A representative sample of a menu is not a menu - the count is right and
 *     the shape is wrong, which is the case a dish threshold cannot see.
 *
 *   81 - Punch Bowl Social. 33 dishes covering brunch and the beer list, with
 *     no dinner entrees; the agent could not find the full food-menu URL and
 *     said so. Same shape as Sarita's: a real capture of part of a menu, which
 *     the dish count cannot distinguish from a whole small one.
 *
 *   4725 - The Coffee Bean & Tea Leaf. Ten real prices, and the agent said
 *     plainly that its Olo storefront reveals price only on a per-item click,
 *     so it sampled across drinks, food and sizes rather than reading all ~150
 *     items. An honest sample is still a sample. This one matters more than
 *     most because it is a chain head: loading it would hand the same ten-item
 *     "menu" to four more branches and mark all five done.
 *
 *   4308 - Parfait Paris. Nineteen dishes, and the agent listed exactly what
 *     it did not get: Sandwiches, Crepes, Macarons and Party Cakes, lost to
 *     DoorDash's virtualised rendering. A patisserie without macarons or cakes.
 *     Also sourced from the Fashion Valley branch because no Mission Hills
 *     location exists, which is worth resolving separately.
 *
 *   1277 - Einstein Bros. Bagels. Ten dishes, every one of them from "Hot
 *     Coffee & Tea". A bagel chain with no bagels. The dish count is well over
 *     the thin threshold and the menu is still absurd, which is the clearest
 *     illustration in this file of why the count cannot be the test - what
 *     matters is whether the SECTIONS make sense for the kind of restaurant it
 *     is. Sixteen branches inherit from this one.
 *
 *   5620 - El Pollo Loco. Twenty-six dishes across nine sections, so the shape
 *     looks right, but "Chicken Meals" - the entire premise of the chain - has
 *     two entries in it, and the agent described its own capture as "a
 *     representative sample". A sample of the section a restaurant is named
 *     after is not a menu. Twenty-four branches inherit.
 *
 *   2964 - Pizza Hut. Fourteen pizzas captured well, and Melts, Party of One,
 *     Pasta, Desserts, Dips and Drinks all lost to store-selection resets. Six
 *     categories missing out of nine, across twenty branches. The agent kept
 *     it at "high" because the items it did capture are accurate, which is a
 *     fair thing to say about the prices and the wrong verdict on the menu.
 *
 *   3300 - Everbowl. Sixteen dishes with the signature bowls fully and
 *     correctly priced, but the agent reported that the site's category tabs
 *     stopped responding partway through and it never reached Smoothies, Sips,
 *     Toast or Coffee Bar. That is four missing categories, not a short menu.
 *     Six branches inherit from this one, so a partial here is a partial six
 *     times over. Worth retrying when Chrome is less contended - the agent
 *     blamed sibling-agent load, which is a condition we control.
 *
 *   1262 - Subway. Nineteen items off DoorDash for a chain that publishes far
 *     more, and the agent flagged it as worth a second look itself. Same
 *     chain-head multiplier: four branches inherit whatever is loaded here.
 *     Subway prices per store and is a known hard case; it deserves a real
 *     first-party read rather than a partial third-party one.
 */
const QUARANTINE_IDS = new Set([
  "4678",
  "4861",
  "4684",
  "5675",
  "5413",
  "5421",
  "81",
  "4725",
  "1262",
  "3300",
  "1277",
  "5620",
  "2964",
  "4308",
]);

/*
 * Aggregator reads that were validated against a second, independent source.
 *
 * The ladder in probe/FINDINGS.md permits tier 5 "only when two independent
 * sources agree on the price", so an agent that cross-checked has met the bar
 * and its work should not be thrown away for the host alone. Cafe 222's
 * aggregator prices were checked against DoorDash and matched within pennies;
 * Tip Top Meats' were checked against SinglePlatform.
 *
 * Named entries are the backlog from waves extracted before the schema carried
 * this. New extractions should set `crossCheckedAgainst` on the entry instead,
 * which is honoured below - a machine-readable field beats a list a human has
 * to remember to update.
 */
const CROSS_CHECKED = new Set(["Cafe 222", "Tip Top Meats"]);

/*
 * Hosts that belong to the same company, and therefore cannot corroborate one
 * another. Each inner array is one owner. Used only by the cross-check test
 * below - these hosts are judged on their own merits everywhere else, since
 * being a DoorDash property does not by itself make a storefront wrong.
 */
const SAME_OWNER = [
  // Grubhub
  [/(^|\.)grubhub\.com$/i, /(^|\.)seamless\.com$/i, /(^|\.)allmenus\.com$/i, /(^|\.)menupages\.com$/i],
  // DoorDash - order.online is its white-label storefront product
  [/(^|\.)doordash\.com$/i, /(^|\.)order\.online$/i, /(^|\.)caviar\.com$/i],
  // Uber
  [/(^|\.)ubereats\.com$/i, /(^|\.)postmates\.com$/i],
];

const clean = [];
const quarantine = [];

for (const file of files) {
  let entries;
  try {
    entries = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    console.error(`${file}: unreadable - ${e.message.slice(0, 70)}`);
    continue;
  }

  for (const e of entries) {
    const dishes = e.dishes?.length ?? 0;
    const host = (() => {
      try {
        return new URL(e.sourceUrl).hostname;
      } catch {
        return "";
      }
    })();

    // A genuine not-found is a result worth keeping: it is what stops the queue
    // re-hunting a restaurant that has no findable menu. It carries no prices,
    // so no source rule applies to it.
    if (dishes === 0) {
      clean.push(e);
      continue;
    }

    const isPlatform = PLATFORM.some((re) => re.test(host));

    /*
     * A cross-check counts only if the second source is independent of the
     * first. Two templated aggregators agreeing is not corroboration - they
     * routinely resell one upstream scrape, so the agreement is a copy talking
     * to itself. An extracting agent spotted this on The Friendly, checking
     * allmenus against another aggregator and flagging in its own report that
     * both might share one stale origin.
     *
     * So the second source is held to the same bar as the first: if it is an
     * untrusted aggregator or a barred host, the cross-check buys nothing.
     * Combined with the freshness rule in QUARANTINE_IDS - a cross-check is
     * worth only what its freshest source is worth - this is what "two
     * independent sources agree" was always supposed to mean.
     */
    const secondHost = (() => {
      try {
        return new URL(e.crossCheckedAgainst).hostname;
      } catch {
        return "";
      }
    })();
    /*
     * Corporate siblings are not independent either, and this is the case the
     * trust test missed for a long time.
     *
     * An agent sourced Los Primos from allmenus and cross-checked it against
     * Seamless, reporting the identical prices as corroboration. Both are
     * Grubhub. The same wave matched an `order.online` storefront against a
     * DoorDash listing and called the exact agreement "a good sign" - and
     * `order.online` IS DoorDash's white-label. In each case the check was
     * performed honestly and proved nothing: one company's data cannot
     * corroborate itself, and it will agree perfectly every time, which reads
     * as unusually strong evidence when it is none.
     *
     * Neither second source was on the untrusted list, so the old rule passed
     * both. Ownership is the thing that matters, not reputation.
     */
    const sameOwner = SAME_OWNER.find((g) => g.some((re) => re.test(host)));
    const secondIsSibling = Boolean(sameOwner) && sameOwner.some((re) => re.test(secondHost));

    const secondIsIndependent =
      Boolean(secondHost) &&
      !secondIsSibling &&
      !UNTRUSTED.some((re) => re.test(secondHost)) &&
      !BARRED.some((re) => re.test(secondHost)) &&
      !BRAND_TWIN.test(secondHost);

    const verified = secondIsIndependent || CROSS_CHECKED.has(e.name);

    let reason = null;
    if (BARRED.some((re) => re.test(host))) reason = `barred source (${host}) - see BARRED`;
    else if (QUARANTINE_IDS.has(String(e.restaurantId))) reason = "held by id - see QUARANTINE_IDS";
    else if (KNOWN_PARTIAL.has(e.name)) reason = "extraction was truncated - see KNOWN_PARTIAL";
    else if (INFERRED_PRICING.has(e.name)) reason = "prices were derived, not read - see INFERRED_PRICING";
    else if (!verified && UNTRUSTED.some((re) => re.test(host)))
      reason = `untrusted aggregator (${host})`;
    else if (!isPlatform && BRAND_TWIN.test(host)) reason = `brand-twin domain (${host})`;
    // `low` is the confidence the ladder *assigns* to a tier-5 source, so
    // rejecting every low entry rejected the exact case the ladder permits:
    // tier 5 is allowed "only when two independent sources agree", and an agent
    // that cross-checked has done that. Costco Food Court cycled through three
    // waves being re-extracted and re-rejected on this, burning a queue slot
    // each time, because the screen was stricter than the rule it enforces.
    else if (!verified && e.confidence === "low") reason = "low confidence and not cross-checked";
    else if (dishes < THIN && !COMPLETE_BUT_SHORT.has(String(e.restaurantId)))
      reason = `only ${dishes} dishes - likely a partial capture`;

    if (reason) quarantine.push({ ...e, quarantineReason: reason });
    else clean.push(e);
  }
}

await writeFile("menus/wip/clean.json", JSON.stringify(clean, null, 2));
await writeFile("menus/wip/quarantine.json", JSON.stringify(quarantine, null, 2));

const dishCount = (a) => a.reduce((s, e) => s + (e.dishes?.length ?? 0), 0);
const notFound = clean.filter((e) => (e.dishes?.length ?? 0) === 0).length;

console.log(
  `clean:      ${clean.length} entries (${clean.length - notFound} with menus, ` +
    `${notFound} confirmed not-found), ${dishCount(clean)} dishes\n` +
    `quarantine: ${quarantine.length} entries, ${dishCount(quarantine)} dishes withheld\n`,
);
for (const q of quarantine) {
  console.log(`  ${q.name} (${q.dishes.length} dishes) - ${q.quarantineReason}`);
}
