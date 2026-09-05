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

import { appendFile, readFile, writeFile } from "node:fs/promises";

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
/*
 * Directory farms found 2026-08-29 as the 301 target of restaurants' own
 * listed `.shop` domains. They are not aggregators with bad data - they are
 * generated listing pages ("12,480+ places, updated weekly", Claim This
 * Listing) that exist to rent a business's name back to it. Barred outright
 * rather than merely untrusted, because there is no confidence level at which
 * a generated page becomes a menu.
 */
const BARRED = [
  /*
   * SERVING MALWARE, 2026-09-03. An extraction agent fetched
   * `taqueriaimperial.shop` and Windows Defender quarantined the downloaded
   * body as a virus; the agent stopped rather than retrying, which was right.
   *
   * It is the brand-twin shape the rest of this list already covers - a
   * cheap-TLD domain minted from a restaurant's name - so treat that shape as
   * hostile rather than merely useless. The row's `website` was nulled so
   * nothing fetches it again. If a fetch of one of these ever trips the
   * antivirus, do not retry it under a different user agent: barre it here and
   * move on.
   */
  /(^|\.)taqueriaimperial\.shop$/i,
  /*
   * Second one the same day: `caferosarita.com` tripped the antivirus on
   * fetch and the agent stopped without retrying, which is the correct
   * response. Note the shape is DIFFERENT from taqueriaimperial.shop - this is
   * an ordinary `.com` matching the restaurant's real name, not a cheap-TLD
   * brand twin. So "looks like a normal domain" is not evidence of safety, and
   * the rule that matters is behavioural: whatever your antivirus flags, bar.
   */
  /(^|\.)caferosarita\.com$/i,

  /*
   * Third one, 2026-09-04: `theirdivebar.com` tripped the antivirus while an
   * agent was reading it for Instant Replay (id 1082). Same lesson as the
   * first two - an ordinary .com matching a plausible bar name is not
   * evidence of safety. The agent stopped on the first hit and did NOT retry
   * under another user agent, which is the correct handling.
   */
  /(^|.)theirdivebar.com$/i,
  /*
   * Fourth one, 2026-09-04: `lambersbakery.com` for Lambers Chinese Bakery.
   * The fetch succeeded, then the written file was Permission denied on the
   * very next read - antivirus quarantining it between write and read. That
   * is the same signal as an outright block, just later in the sequence. The
   * agent stopped and did NOT retry under another user agent.
   */
  /(^|.)lambersbakery.com$/i,
  /*
   * Fifth one, 2026-09-04: `jaguarpaw.co` - an alternate domain tried after
   * Jaguar Paw`s listed domain turned out to be parked. A parked primary is a
   * common setup for these; the alternate is not automatically safer.
   */
  /(^|.)jaguarpaw.co$/i,
  /(^|\.)yelp\.com$/i,
  /(^|\.)yelp\.[a-z.]+$/i,
  /(^|\.)locallya\.com$/i,
  /(^|\.)placejoys\.com$/i,
  /(^|\.)bestcafes\.online$/i,
  /*
   * Two more of the same family, found 2026-08-29. `weeblyte.com` turned up as
   * the redirect target of another restaurant's listed `.shop` domain, and
   * `gotoeat.net` announced itself more usefully: its menu rows were visibly
   * garbled AI scrapes - dish names truncated to "Ken $" and "Se $". That is
   * the cheapest tell yet for this class of site. A real menu page has whole
   * words in it.
   */
  /(^|\.)weeblyte\.com$/i,
  /(^|\.)gotoeat\.net$/i,
  /(^|\.)foodjoyy\.com$/i,
];

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
  /*
   * `sagemenu` and `menupages` are named as tier 5 in PLAYBOOK.md's source
   * ladder and were missing here, which is the same omission the
   * restaurantguru comment above describes - and it recurred for the same
   * reason: the ladder lives in prose an agent reads, the enforcement lives in
   * this array, and nothing keeps the two in step.
   *
   * Found 2026-09-03 when Pho Anh & Grill (id 6050) arrived sourced from
   * allmenus with `crossCheckedAgainst` pointing at sagemenu, ten items
   * matching to the cent. Every independence test passed, because sagemenu was
   * not on any list. Two tier-5 aggregators asked the same question is not
   * corroboration, and the exact agreement reads as strong evidence when it is
   * none.
   *
   * If a source is named in the ladder's tier 5, it belongs in this array.
   * Check that when the ladder next changes.
   */
  /(^|\.)sagemenu\./i,
  /(^|\.)menupages\./i,
  /(^|\.)menutoeat\./i,
  /(^|\.)foodboss\./i,
  /(^|\.)checkle\./i,
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
   * Site builders and small ordering hosts, all found the same way: an audit of
   * every restaurant whose LISTED website sits on a brand-twin TLD, which is
   * the cheapest way to find these. `business.site` is Google's retired site
   * builder, `canva.site` is Canva, and `placemap.site` and `eatat.us` are
   * small ordering hosts. None of them is a restaurant imitating a chain; they
   * are the free tools a small restaurant actually uses.
   */
  /(^|\.)business\.site$/i,
  /(^|\.)canva\.site$/i,
  /(^|\.)placemap\.site$/i,
  /(^|\.)eatat\.us$/i,

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
   * `applova.menu` is Applova's ordering platform, which serves restaurant
   * storefronts as `<name>.applova.menu` - the same shape as `<name>.toast.site`
   * two entries up, and flagged for the same wrong reason.
   *
   * It surfaced on Raul's Mexican Food (2329), whose 34-dish capture was
   * withheld as a brand-twin. The restaurant has rebranded to "Raul's Shack",
   * so the storefront subdomain matches the NEW name while the record still
   * carries the old one - which is exactly the shape a squat has, and is not
   * one here. The check the comments above prescribe settled it: raulsshack.com,
   * the website on the record, links to applova.menu itself. A squatter is
   * never linked to by the business it imitates.
   *
   * Worth noting for the next rebrand: the brand-twin rule compares a domain to
   * the name WE hold, so any restaurant that renames itself will trip it until
   * the record catches up. The address is what settles those, not the name.
   */
  /(^|\.)applova\.menu$/i,

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

  /*
   * Crispy Fried Chicken, on `.us` - and this one inverts the usual story.
   *
   * Normally a `.us` under a restaurant's name is a farm renting recognition
   * the real `.com` earned. Here the `.com` is the impostor: it was hijacked
   * and now redirects to an offshore-casino guide, while the `.us` is the
   * restaurant's genuine site. The extracting agent verified it rather than
   * accepting either at face value - matching contact email and Squarespace
   * hosting - and read 92 dishes off its menu-board images.
   *
   * Fifth false positive from BRAND_TWIN, and the first where the legitimate
   * site was on the suspicious TLD *because* the good domain had been taken.
   * "The real homepage does not link to it" fails as a test when the real
   * homepage no longer belongs to the restaurant.
   */
  /(^|\.)crispyfriedchickensd\.us$/i,

  /*
   * Thai One On, on `.us`. The extracting agent checked the address and content
   * against the record before reading a price, exactly as the rule asks, and
   * reported it as the restaurant's own ordering site rather than a squat. 125
   * dishes.
   *
   * Sixth false positive from BRAND_TWIN, and the plainest illustration of what
   * the rule is actually for: it exists to catch a CHAIN name worth imitating.
   * Thai One On is one independent Thai restaurant in Pacific Beach. There is
   * no recognition to rent, so there is no motive to squat, and the TLD carries
   * no signal at all. Tally is now three true against six false.
   */
  /(^|\.)thaioneon\.us$/i,

  /*
   * Tarbosh Mediterranean, on `.us` - the site of the restaurant now trading at
   * the address our record still calls "Gate of Damascus". The agent confirmed
   * the rebrand and the matching address before reading a price.
   *
   * Seventh false positive from BRAND_TWIN against three true hits, and it adds
   * a wrinkle worth naming: a REBRAND makes the rule fire twice as hard,
   * because the new name has no history on the old `.com` and the odd TLD is
   * often the only domain the new owners bought. Nothing about that is
   * suspicious; it is just a small restaurant changing its name.
   */
  /(^|\.)tarbosh\.us$/i,
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
const BRAND_TWIN = /\.(us|info|biz|site|online|store|shop|menu)$/i;

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
  // 3171 - Addison at Fairmont Grand Del Mar. Three Michelin stars, and it
  // publishes exactly three prices anywhere: the $395 ten-course tasting menu,
  // the $198 Champagne Lounge tartelette menu, and a $175 champagne pairing
  // supplement. No a la carte and no itemised courses exist to be missed. An
  // earlier pass captured 2 and was held for a re-read; the re-read confirmed
  // the number on both granddelmar.com and the Fairmont site. Three dishes is
  // the whole truth here, and the thin-capture heuristic is wrong about it -
  // which is what this set is for.
  "3171",
  // 2125 - Yummy Sushi. All-you-can-eat, and the whole priced menu is three
  // tiers: $45 adult, $24 kids, $89 premium. Same shape as Super China Buffet
  // below - there is no fourth thing to have missed.
  "2125",
  // 2156 - Liuyishou Hot Pot. All-you-can-eat: the entire priced menu is six
  // per-person tiers. There are no individual item prices to have missed,
  // because the restaurant does not sell individual items.
  "2156",
  // 4013 - Batch & Box. A small bakery with seven products on its own Shopify
  // store. Seven is the whole catalogue, not a sample of it. (One oddity worth
  // knowing if this ever looks wrong: "The Dubai" cookie is listed at $1.50
  // against $4.50-$5.00 for the other singles, which may be an upcharge line
  // rather than a price - the agent recorded the only figure published and
  // said so.)
  "4013",
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
 *   2573 - Fleming's Prime Steakhouse. Forty-seven dishes off DoorDash, and
 *     FORTY-FIVE of them end in .50 - 96%. The restaurant's own site quotes
 *     whole dollars ($82 filet mignon).
 *
 *     The division test cleared it: 1.20 produces zero round results and 1.25
 *     only eight. That is the test's blind spot, and it is worth stating
 *     plainly - the platform marks up and THEN rounds to the nearest fifty
 *     cents, which destroys exactly the clean ratio the test looks for.
 *     $82 x 1.15 = $94.30, rounded to $94.50. Every trace of the multiplier is
 *     gone and the markup is entirely intact.
 *
 *     So a uniform cent-ending is its own signature, independent of any
 *     divisor. A real menu prices in whole dollars, or in .95, or messily. It
 *     does not put an entire steakhouse on .50 boundaries.
 *
 *   2777 - Konito's Cafe. Sourced from a DoorDash listing for "Pablo's Cafe"
 *     and validated against the website of "Kono's Cafe" - three different
 *     business names in one chain of reasoning, for a restaurant we hold as
 *     Konito's Cafe at 1730 Garnet Avenue. Kono's Cafe is a SEPARATE
 *     restaurant already in this corpus (id 144, 704 Garnet Avenue, 5,270
 *     reviews), so the corroboration was against a different business that
 *     happens to sit on the same street.
 *
 *     The agent's reasoning was careful - matching menu structure and reviews -
 *     and that is exactly why this is worth recording: careful reasoning
 *     across a name mismatch still lands on the wrong restaurant. Whether 2777
 *     and 144 are two businesses or one OSM duplicate is a separate question
 *     someone should settle; either way this menu should not load.
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
/*
 * Quarantines that a later extraction actually fixed.
 *
 * A held id is a bet that a better read exists, and the bets come due. Checked
 * BEFORE QUARANTINE_IDS so the original note stays where it is - the reasoning
 * for holding is worth as much as the release, and deleting it would leave the
 * next person wondering why a menu was ever in doubt.
 *
 * The bar for adding an id here is that the NEW capture answers the OLD
 * complaint specifically. Not that it is bigger; that it fixes the named
 * defect. Each line below says which.
 *
 * Released 2026-08-29, all re-extracted after the ids were held:
 */
/*
 * Restaurants whose repeated rows were checked BY HAND and found to be real
 * dayparts rather than two copies of one menu.
 *
 * The doubling check (see `looksDoubled`) assumes "a restaurant genuinely
 * listing a third of its dishes twice does not happen". A multi-daypart menu on
 * a restaurant's own site does exactly that, and the assumption cost a real
 * 221-dish menu before this map existed.
 *
 * An entry here is not a blanket exemption. `daypartCleared` also requires that
 * no dish name carries two different prices, so the dangerous version of a
 * doubled catalog stays quarantined even for a listed id. Add an id only after
 * looking at the sections yourself, and say in the note what you looked at.
 */
const DAYPART_VERIFIED = new Map([
  // 6588 - The Henry (Coronado). 221 rows, 131 distinct name+price, 11 section
  // pairs overlapping >90%. Checked 2026-09-02 against the capture: the repeats
  // are the weekday Breakfast list reappearing under Weekend Brunch, and the XV
  // Coffee / Espresso / Bold Blends lists reappearing under Dessert and
  // Beverage. Zero dish names carry two different prices, so nothing here is a
  // choice between two candidate figures. Source is the restaurant's own
  // FOX Restaurant Concepts site, server-rendered and keyed by location id 609,
  // whose location_page_url confirms the Coronado branch.
  ["6588", "8 real dayparts on the restaurant's own site, no price conflicts"],
]);

const RELEASED_IDS = new Map([
  /*
   * Three released together on 2026-09-03, and they belong together because
   * each hold was about a METHOD rather than about the restaurant.
   *
   * 2539 Isshido Ramen was held because an agent divided a confirmed markup out
   * and filed the quotients. 3416 Santorini because an allmenus capture cited a
   * PRICELESS page as its `crossCheckedAgainst`, which cannot corroborate a
   * number it does not contain. 909 Flame Bar because two non-overlapping
   * listings were merged into a menu no source publishes.
   *
   * None of those objections describes the new captures, which come off
   * different hosts by different routes and were each read verbatim from ONE
   * source with no cross-check claimed. Verified here rather than taken from
   * the reports: all three are 100% conventional cent endings as read, and in
   * every case the best divisor between 1.02 and 1.35 makes them WORSE
   * (Isshido 44% at 1.20, Santorini 36% at 1.22, Flame Bar 46% at 1.11), which
   * is the signature of a printed menu rather than an uplifted one.
   *
   * The lesson to carry: read a QUARANTINE_IDS note for what it actually
   * objects to. A hold on "this agent divided a markup out" does not bar the
   * restaurant, or the platform, or even the same source read honestly - it
   * bars that number. Several of these entries would otherwise sit held
   * forever over a mistake nobody is making any more.
   */
  ["2539", "Toast, read verbatim, 100% conventional endings, no divisor improves it"],
  ["3416", "Uber Eats, single source, no cross-check claimed, no markup shape"],
  ["909", "DoorDash, single source, .95/.99/.00 only, no merge"],
  // 4972 - George Burgers. Held 2026-08-29 because an agent divided a
  // confirmed 1.20 DoorDash markup out and filed the quotients as the menu.
  // That objection is about a DERIVED number, and the 2026-09-02 capture does
  // not contain one: it is Uber Eats (a different owner from DoorDash, so not
  // the same listing talking to itself), read verbatim, and the agent that
  // took it REJECTED DoorDash for the very markup the hold is about rather
  // than dividing it out again.
  //
  // Checked here rather than taken on the report's word. All 107 prices land
  // on a conventional ending as read - $7.99, $8.99, $10.99 - and no divisor
  // improves that: 1.10 drops it to 25%, 1.15 to 14%, 1.20 to 40%, 1.25 to
  // 17%. A marketplace applying a uniform uplift cannot produce that shape,
  // so this storefront is passing the restaurant's own prices through.
  //
  // Stays `medium`: Uber Eats is a marketplace, which is tier 3 on the ladder
  // no matter how clean the arithmetic looks.
  ["4972", "re-sourced verbatim from a different owner, no markup shape at any divisor"],
  // Held for Burritos, Bowls, Sides and Drinks rendering zero items. The new
  // read has all four, off the restaurant's own Square page.
  ["4378", "empty categories now populated (7 sections, first-party)"],
  // Held because a shop called Coffee AND Tea had no tea, matcha or food.
  ["4418", "Tea Based, Matcha, Acai Bowls, Bagels and Sandwich all present"],
  // Held as a DoorDash subset whose Tacos, Enchiladas, Tortas and Specialties
  // existed only as choices inside combos. Now read off a dated Yelp menu
  // photograph, which carries all of them as standalone priced items.
  ["3071", "18 sections incl. every category the DoorDash read could not reach"],
  // Held for a tier-5 menupages capture cross-checked by "markup direction",
  // which is not agreement. Replaced by a dated first-party menu photograph -
  // a different class of source, so the objection no longer applies.
  ["3236", "re-sourced from a dated menu photograph, not an aggregator"],
  // Held because a brewery's beer list was excluded as "not food". The new
  // capture carries eight food sections AND priced beer.
  ["4541", "food and priced beer both captured"],
  // Held as a pho house with no pho - the only priced source for those sections
  // ran 1.17x over the real menu. Now has Deluxe Pho, Create Your Own Pho, Bun
  // Bo Hue and Banh Mi.
  ["3982", "the namesake sections are present"],
  // Both held for capturing "a representative cross-section" rather than the
  // menu - 95 and 41 dishes. Now 236 and 315, with full nigiri, sashimi and
  // roll sections.
  ["4410", "236 dishes across 18 sections, no longer a sample"],
  ["2823", "315 dishes across 25 sections, no longer a sample"],
  // 3694 - Hokkaido Ramen Santouka. Held because two blurry cells were filled
  // in with the board's own arithmetic (L = M + $1, S = M - $1). The hold note
  // asked for a higher-resolution re-read and said it would come straight back.
  // It did: 87 dishes, and where this read could not see a cell it left the
  // dish out instead - the Miso row of the B, C and D combos behind camera
  // glare, and the side dishes behind a physical "sold out" tag.
  //
  // Released after checking the photograph in this session rather than taking
  // the report's word for it. Salt, Soy Sauce and Miso all read $9.50 / $10.50 /
  // $11.50 for S/M/L and Spicy Miso $10.00 / $11.00 / $12.00, matching the
  // entry exactly; Rice $1.50 and Charsiu Rice Bowl $4.50 likewise. The glare
  // band and the sold-out tag are both visible in the image, exactly where the
  // agent said its gaps were.
  //
  // Note the trap this one sets: a board whose sizes really do step by $1
  // produces read prices that look derived. The evidence that separates them is
  // not the numbers, it is whether the unreadable cells came back empty.
  ["3694", "re-read at full resolution; unreadable cells omitted, not derived"],
  // A patisserie now carrying Party Cakes, Macarons, Gelato, Crepes and
  // Pastries.
  ["4308", "the cakes and pastries a patisserie is judged on are present"],
  /*
   * Released 2026-08-29. Held for the same defect as 3236 and 1977 - a tier-5
   * menupages capture offered with DoorDash as a cross-check on the grounds
   * that "markup direction confirms it", which is not agreement. The new read
   * is first-party (its own Bentobox/SpotOn site), so the objection is gone.
   *
   * Worth noting it also overturns a SECOND, later call. Earlier the same day
   * this restaurant was marked blocked because "gelato and pizza have zero
   * prices anywhere" - but the pizza section is 39 priced rows of slices and
   * trays. Only the gelato FLAVOUR list is unpriced, which is how gelaterias
   * work: you pay by size, not by flavour. That is a complete menu, not a gap.
   */
  ["3833", "re-sourced first-party; pizza is priced after all (39 rows)"],
  /*
   * Released 2026-08-29. Held earlier the same day because its two tier-5
   * sources disagreed about what the restaurant even sells - an older
   * combo-plate menu against a newer build-your-own concept - which is two eras
   * of a business, not corroboration. The re-read is first-party
   * (kennedysmeatcompany.com/menu), so there is nothing left to corroborate.
   */
  ["4878", "re-sourced first-party; the two-era cross-check is moot"],
  /*
   * Released 2026-08-29. Held earlier the same day for a DoorDash page that
   * rendered virtualized, leaving 2 Enchiladas, all Tostadas, Caldos, Dessert
   * and Kid's illegible. The re-read carries 2 Enchiladas, Supreme Tostadas,
   * Tostadas and Caldos - every CORE section named in the original complaint.
   * Dessert and Kid's are still absent and are adjuncts by the core/adjunct
   * rule; a Mexican menu is not judged on its kids' portions.
   */
  ["4211", "the enchiladas, tostadas and caldos it was held for are now present"],
  /*
   * Released 2026-08-29. Held earlier the same day at 43 dishes covering Dinner,
   * Kids and Desserts, with Lunch, Brunch, Happy Hour and the drinks menus
   * "skipped for time" - four separate menus absent behind a coherent-looking
   * dinner capture.
   *
   * The re-read is 272 dishes across all nine tabs, and the reason it worked is
   * worth keeping: this is a Wix menu widget, where only the ACTIVE tab is
   * server-rendered and the rest live at `?menu=<slug>` URLs. The first agent
   * was not skipping work so much as not knowing the other menus were
   * separately addressable.
   */
  ["4752", "all nine Wix menu tabs fetched - 43 dishes became 272"],
  /*
   * Released 2026-08-29. Held earlier the same day at 15 dishes in two sections,
   * "Most Ordered" and "Tortas" - a Mexican restaurant with no tacos or
   * burritos - and on an agent report that contradicted itself twice about the
   * count. The re-read is 82 dishes with Tortas, Burritos, Tacos, Quesadillas
   * and Seafood all present, address-verified, and passing the markup test with
   * its best divisor only 17.6% clean.
   */
  ["4037", "the core sections are present and the count is no longer in doubt"],
  /*
   * NOT released: 2315, Bottlecraft Little Italy. It was held because the venue
   * is a BOTTLE SHOP and a tap list describes the smaller half of what it
   * sells. The new capture is 24 items in a single "Draft List" section - the
   * same half, from a different page. Nothing about the objection has changed,
   * and releasing it because the number moved would be exactly the mistake the
   * section-shape rule exists to prevent.
   */
]);

const QUARANTINE_IDS = new Set([
  // 5988 - Lucy's Bakery. Held 2026-09-03, the second mixed payload in two
  // batches, and the one that shows how the check fails in practice.
  //
  // 34 prices, 56% conventional - past the floor. Twelve rows on `.50` and
  // five on `.00` are the printed menu. The rest scatter across `.35 .33 .92
  // .67 .12 .85 .98 .40 .75`, and the rows say it plainly: Torta de Milanesa
  // $10.35, Torta de Chorizo $5.33, Torta Embarazada $13.92. A torta shop does
  // not price to the odd cent.
  //
  // The agent DID look at the rows - the brief told it to - and then wrote that
  // the scatter "reads as genuine odd pricing, not a divisor fee". That is the
  // failure mode to guard against: the test was run and then argued away.
  // Cross-checking made it worse, because DoorDash and Uber Eats carried an
  // identical catalog, which is two readers of one computed field agreeing.
  //
  // Rule of thumb for whoever reads the next one: **if you are constructing an
  // explanation for why odd cents are legitimate, block instead.** Genuine odd
  // pricing exists - a per-pound counter, a weight-priced fruteria - but it
  // does not sit in the same capture as a tight `.50` cluster on the same kind
  // of item.
  "5988",
  // 6316 - D-K-Che Fruteria. Held 2026-09-03, and it is the case that shows a
  // percentage threshold is not enough on its own.
  //
  // 158 prices, 52% on a conventional cent ending - comfortably past the ~30%
  // floor an agent is told to block under, and no divisor beats 1.000. On the
  // aggregate numbers it looks fine. Then read the rows: Chicken Wrap $14.83,
  // Turkey Wrap $14.29, Turkey Sandwich $14.14, Tuna Sandwich $14.68. Nobody
  // prints those.
  //
  // The shape is a MIXED payload, which neither test was built for. Fifty rows
  // sit on `.95` and are plainly the printed menu; the other 108 scatter across
  // seventeen endings and are computed. Averaged together they clear the gate,
  // because the honest half carries the dishonest half over the line.
  //
  // So: a threshold answers "is this whole capture computed". It cannot answer
  // "is PART of it". When the endings show one tight cluster plus a long flat
  // tail, look at the actual dish rows before believing the percentage - a
  // sandwich priced to the odd cent is the tell, and no summary statistic
  // replaces reading six of them.
  //
  // Re-queues. The `.95` subset is probably recoverable from a first-party
  // source; this marketplace payload is not the place to recover it from.
  "6316",
  // 6577 - Yingli Restaurant. Held 2026-09-03. Not a markup, not staleness:
  // these numbers are not menu prices at all, and the tell is the cent column.
  //
  // 302 rows, and only 6% land on a conventional ending. Caldo Udon $26.03,
  // Caldo Pekin $23.24, Caldo Camaron $32.17; the commonest endings are .37
  // (35 rows), .67 (31), .33 (27), .04 (25). No restaurant prints that. A
  // fine divisor sweep from 1.0000 to 1.6000 in steps of 0.0005 never gets
  // past 47%, so it is not one fee applied uniformly either - if it were, some
  // divisor would snap the distribution back onto .00/.50/.95/.99.
  //
  // The capture came off a custom white-label Next.js ordering platform, read
  // out of an escaped React flight payload under `rawMenus`. The most likely
  // explanation is that the field read is a computed number - tax or a service
  // charge folded per item, or a converted currency - rather than the listed
  // price. Which it is does not matter: whatever produced .37 and .04 endings
  // at this rate is not the price on the wall.
  //
  // The extracting agent reported the figures as "corroborated across 3
  // independent platforms". Three readers of the same computed field agree
  // with each other and are all wrong; agreement is about the LISTING, never
  // about the price level. **A cent distribution that is flat across all 100
  // endings is evidence no amount of corroboration can overturn.**
  "6577",
  // 5795 - Baci Restaurant. Held 2026-09-03 on price level, which the playbook
  // says overrides every other signal, and on a cross-check that is not one.
  //
  // The capture is honestly sourced and internally clean: 223 rows, every
  // price ending `.00`, no markup shape. It is also priced for about 2012.
  // Vitello Piccata and Vitello Marsala at $18.00, Salmon Piccata $18.00,
  // Pollo al Limone $14.00 - white-tablecloth Italian entrees in San Diego do
  // not run $14-18 in 2026. The extracting agent saw it too and said the wine
  // list's vintages read like an old snapshot.
  //
  // The second problem is the corroboration. `crossCheckedAgainst` names
  // allmenus against a SinglePlatform source, and those are different
  // COMPANIES but usually not different DATA: SinglePlatform syndicates
  // restaurant-submitted feeds outward, and allmenus carries them. Matching to
  // the cent is what one feed read twice looks like. The ladder's independence
  // rule is about the number's origin, not the logo on the page.
  //
  // Both halves of tier 4's warning fired at once here: restaurant-submitted,
  // and stale until proved otherwise. Re-queues for a first-party read.
  "5795",
  // 4539 - Flora. Held 2026-08-30 on section shape alone, and the method that
  // produced it deserves recording because it was exemplary.
  //
  // This is one of the three restaurants whose fabricated PDF prices were
  // deleted earlier the same day. The agent that drew it read that history,
  // re-confirmed `pdftoppm` is still absent, never touched `Read` on the PDF,
  // and never divided anything. It then found that while the PDF's dish titles
  // are graphics, its "Sides" block and mimosa terms DO extract as clean
  // name/price pairs - ten genuine first-party numbers - and used those to
  // validate brunchspotter.com's independently published menu, which matched
  // exactly. That is precisely the "PDF gives partial prices, cross-check
  // another source" path the playbook describes.
  //
  // The capture is still brunch-only. Flora serves dinner Thursday to Sunday
  // and no readable source was found for it; the wine and cocktail PDF is a
  // multi-column scramble and was correctly excluded rather than guessed. By
  // the core-versus-adjunct rule dinner is a menu, not an adjunct - this is the
  // West End Del Mar case with the dayparts swapped.
  //
  // Held rather than loaded because a brunch menu filed under a full-service
  // restaurant reads as the whole thing, and this restaurant in particular has
  // already had one wrong menu attached to it.
  "4539",
  // 3715 - Pho Royal. Held 2026-08-30, and this restaurant has now failed twice
  // in two completely different ways, which is worth reading together.
  //
  // The first capture was one of the three deleted for fabricated pricing: its
  // own PDF is a pure image (pdftotext yields 2 bytes) and an agent reported
  // reading prices "visually" from it. Those 89 dishes were removed.
  //
  // This second capture is honestly sourced - DoorDash's server-side JSON-LD,
  // address-matched, no markup signature - and is still wrong by section shape.
  // 82 dishes, and the "Pho" section holds exactly ONE item. Not one pho
  // variety: one row. No dish anywhere in the capture has "pho" in its name.
  // A restaurant called Pho Royal whose menu contains no pho is the Mignon Pho
  // case again, and the agent flagged it in its own notes rather than letting
  // it pass.
  //
  // Note also a 25-item "Featured Item" section, which is the carousel this
  // pipeline usually dedupes - so a third of the capture may be duplication on
  // top of the missing core.
  //
  // The lesson worth keeping: an honest source is not the same as a complete
  // one. Fixing the fabrication problem did not fix this restaurant.
  "3715",
  // 2220 - Carmen's Mexican Food. Held 2026-08-29 on price level, which the
  // playbook says overrides every other signal.
  //
  // The capture is a photograph of the restaurant's own two-page printed menu -
  // first-party, complete, unambiguous - and DATED 2018. The agent noticed a
  // third-party listing showing prices 40-50% higher and set it aside as
  // "unverified provenance", corroborating the low figures instead against
  // comments on a 2022 blog post.
  //
  // Read the other way round, that 40-50% gap is the finding. Eight years of
  // menu inflation looks exactly like this, and a 2022 corroboration is itself
  // four years stale. The newer source being poorly sourced does not make the
  // older one current; it leaves us with no source that is.
  //
  // Same shape as Tandoor: an intact first-party artefact whose only defect is
  // its age, and nothing but the numbers gives it away.
  "2220",
  // 909 - Flame Bar and Grill. Held 2026-08-29 for a gentler version of the
  // same instinct as 2539 and 4972: the agent found DoorDash and
  // allmenus/Grubhub carrying almost entirely NON-OVERLAPPING item sets for
  // this address, and combined them into one menu.
  //
  // The reasoning was careful - the single shared dish matched closely
  // (Hummus $7.95 vs $8.00), which does suggest both are current rather than
  // one being stale. But the result is a menu that no source publishes, drawn
  // from two different pricing regimes, and `load-menus.mjs` says exactly why
  // that is barred: "merging two extractions of the same restaurant produces a
  // menu that never existed."
  //
  // Non-overlapping item sets are also evidence worth reading rather than
  // resolving. Two listings for one address that share one dish out of seventy
  // may be two different menus, two eras, or two businesses. Re-queue for a
  // first-party source that settles it.
  "909",
  // 4972 - George Burgers. Held 2026-08-29 for the same reason as 2539, found
  // in the same hour by a different agent that had not yet been told: all 91
  // DoorDash items divided cleanly by exactly 1.20, and it recorded the divided
  // figures as the menu.
  //
  // Two agents independently making this move on one day is the useful part.
  // It is not carelessness - both confirmed the multiplier rigorously and both
  // were probably arithmetically right. It is that dividing out a markup FEELS
  // like recovering the true price rather than inventing one, and nothing in
  // the pipeline contradicts that feeling: the corrected numbers pass every
  // check, including the markup test they were derived from.
  //
  // This restaurant was already a documented markup case - 63 of 83 prices
  // divide by 1.2 - so the source is exactly the one the ladder bars.
  "4972",
  // 2539 - Isshido Ramen. Held 2026-08-29, and this one is subtle enough to be
  // worth reading twice.
  //
  // The agent found the same 1.15 DoorDash markup that got this restaurant
  // blocked earlier the same day - 113 of 115 items landing cleanly on
  // .95/.50/.00 after division - and then DIVIDED IT OUT and recorded the
  // results as the menu. The arithmetic is almost certainly right. That is not
  // the point.
  //
  // Every price in that entry is a number nobody ever published. The corrected
  // figures also defeat the screen's own markup test by construction, because
  // they no longer divide by anything - so a derived menu passes where the
  // marked-up one it came from was caught. The whole reason this project reads
  // sources rather than reasoning about them is that a plausible number and a
  // true one are indistinguishable downstream.
  //
  // Re-queue for a source that states the price. If none exists, blocked is the
  // honest answer, not a reconstruction.
  "2539",
  // 4752 - West End Del Mar. Held 2026-08-29: 43 dishes covering Dinner, Kids
  // and Desserts, with Lunch, Brunch, Happy Hour and the drinks menus "skipped
  // for time" by the agent's own account.
  //
  // The agent framed that as a deliberate exclusion on the precedent set by
  // dropping chain party-trays, and the precedent does not stretch this far.
  // Party trays are an adjunct to a menu; lunch and brunch ARE menus. This is
  // the Farmhouse 78 shape without the platform's help - four separate menus
  // absent, and 43 coherent dinner rows looking like a complete restaurant.
  //
  // The rule the briefs carry is that running out of time is a reason to mark a
  // restaurant blocked, not to file a partial as complete. Re-queue.
  "4752",
  // 4037 - Santa Anna Mexican Food. Held 2026-08-29: 15 dishes in two sections,
  // "Most Ordered" and "Tortas". A Mexican restaurant with no tacos, burritos
  // or plates. The agent's own report contradicted itself about the number -
  // "15 dishes (of 91 found)", then a correction saying it had "recorded a
  // representative subset" - and the file agrees with the smaller figure.
  //
  // A representative subset is the thing this project most explicitly does not
  // want, and the confusion is the tell: an agent that is sure what it captured
  // does not need to correct itself twice about the count. Re-queue.
  "4037",
  // 4228 - Coco Bomb. Held 2026-08-29 on the branch rule rather than on
  // quality: the capture is a clean 39-item read off the brand's own Toast
  // state, but it is the CONVOY ST location's ordering page, and this id is the
  // Ulric St store. The agent flagged it honestly.
  //
  // Loading it would put one branch's prices under another branch's name, which
  // is the one thing propagation exists to do properly - by normalised name,
  // with the source branch recorded and the distance checked. Let the pipeline
  // hand it over instead of hand-copying it here.
  "4228",
  // 3416 - Santorini. Held 2026-08-29 for a misuse of `crossCheckedAgainst`
  // that the screen cannot see and that would otherwise have let a tier-5
  // aggregator through on its own.
  //
  // The prices came from allmenus. The cross-check field points at the
  // restaurant's own site - which, by the agent's own report, prices nothing.
  // It was used to confirm the SECTION SHAPE matched, which is a genuinely
  // useful check and is not what this field means. `crossCheckedAgainst` is the
  // ladder's condition for trusting tier 5 at all: two INDEPENDENT sources
  // agreeing on PRICE. A priceless page can date a menu or vouch for its shape;
  // it cannot corroborate a number it does not contain.
  //
  // Its two batch-mates, Flame Bar and Chito's, cited nothing and were caught
  // automatically. This one was only caught by reading the report against the
  // file - which is the argument for the field carrying a note about what
  // actually agreed.
  "3416",
  // 3598 - Farmhouse 78. Held 2026-08-29, and the reason is a new failure mode
  // worth more than the one menu. Its Toast page served a complete-looking 64
  // items across Lunch and Cold Drinks - and Toast was TIME-GATING the menu to
  // the currently-serving period. Breakfast (Fri-Sun 8-11) and Supper (Fri-Sat
  // from 5) were not absent; they were not being served at the moment the agent
  // looked.
  //
  // This is nastier than the closed-store gate, which at least announces itself
  // by showing nothing. Here the page works, the prices are real, the sections
  // are coherent, and the capture is one daypart of three wearing the shape of
  // a whole menu. Nothing downstream can detect it - not the count, not the
  // markup test, not section shape, because a lunch menu looks like a menu.
  // Only the agent noticing the serving hours catches it.
  //
  // Re-queue for a read inside a breakfast or supper window.
  "3598",
  // 1674 - JJ's Sushi and Pho. Held 2026-08-29, and the agent's own report is
  // why: it read dated Yelp menu photographs, correctly spotted that three of
  // them were from Jan 2017 and showed a DIFFERENT restaurant concept, threw
  // that era out rather than blending it - all exactly right - and then said it
  // had stopped at a fraction of the 39 photos, leaving specialty rolls, the
  // beef and pork entrees and desserts possibly unread. Specialty rolls are not
  // an adjunct at a sushi house. Re-queue to finish the photo set, not to redo
  // the reasoning.
  "1674",
  // 1961 - Bei Yuan Tea & Boba. Held 2026-08-29: its own kwickmenu storefront
  // now redirects to the platform's generic homepage, so the capture came from
  // DoorDash, and the agent noted the listing "likely doesn't carry the
  // complete boba/tea flavor list, only what's featured there". At a boba shop
  // the flavour list IS the menu; 55 rows without it is a drinks shop with no
  // drinks. Same shape as 3N1 - a marketplace's category set standing in for
  // the restaurant's.
  "1961",
  // 3977 - Imperial Mandarin. Held 2026-08-29 for an inversion of the ladder
  // that is reasoned, honest, and still the wrong call. The agent read the
  // restaurant's OWN site, judged its dim sum prices ($2.60-$3.95, under an
  // explicit "prices subject to change" disclaimer) to be stale, and preferred
  // menupages cross-checked against restaurantguru - two tier-5 aggregators
  // agreeing TO THE CENT.
  //
  // Cent-exact agreement between aggregators is the documented false-strength
  // signal: it is what a copy looks like, not what corroboration looks like.
  // Both are scrapers and neither is the restaurant. And "the first-party
  // source looks old" is an inference; a dated disclaimer is not evidence of a
  // specific wrong price. Two weak sources do not outrank a first-party one by
  // agreeing with each other.
  //
  // The stale-first-party problem is real and worth solving - but by dating the
  // menu, not by demoting it. Re-queue for a read that establishes WHEN.
  "3977",
  // 3132 - Bonchon Chicken. Held 2026-08-29 despite being a clean read off the
  // brand's own platform with a San Diego store selected: 57 dishes covering
  // the chicken tiers, apps, sides, desserts and drinks, but with Fried Rice,
  // Bibimbap, Sesame Salad, Udon Soup and Party Bundles left behind because
  // they are size-modifier gated and the clicks stopped landing. A Korean
  // chicken house with no bibimbap and no fried rice is short by section
  // shape. It is held rather than loaded because it is a CHAIN HEAD - a
  // partial here propagates the gap to every branch, so the cost of loading a
  // 57-row Bonchon is not one menu, it is all of them. Cause was almost
  // certainly sibling-Chrome contention, which means a re-extract fixes it.
  "3132",
  // 4878 - Kennedy's Karne. Held 2026-08-29: tier 5 (allmenus) cross-checked
  // against menupix, and the agent flagged that the two item sets do not
  // overlap cleanly - it reads like an older combo-plate menu against a newer
  // build-your-own concept. A cross-check whose two halves disagree about what
  // the restaurant sells is not corroboration, it is two eras of the same
  // business, and picking one is guessing which. Re-queue for a first-party
  // read.
  "4878",
  // 4211 - Senor Pancho Fresh Mexican Grill. Held 2026-08-29: 71 dishes off a
  // DoorDash page that renders virtualized, so get_page_text returns nothing
  // and the agent had to scroll-and-screenshot each category. It captured most
  // of them and said plainly which ones came out illegible - 2 Enchiladas, all
  // Tostadas, Caldos, Dessert and Kid's - and omitted rather than guessed
  // them. That is the right call and the reason this is recoverable, but a
  // Mexican menu missing its enchiladas and tostadas is a partial by section
  // shape no matter how the count reads. Not the same restaurant as Senor
  // Pancho's (the in-store board photo, 116 dishes) - different id, different
  // business, similar name.
  "4211",
  // 3592 - 3N1 Sports Bar & Grill. Held 2026-08-29 on the extracting agent's
  // own account: its site prices nothing, so the capture came from a DoorDash
  // listing whose category set is narrower than the real 12-section menu.
  // Southsiders/tacos, Board Meats, Return of the Mac, Main Events (steak
  // frites), the kids menu and desserts do not appear on DoorDash at all - 18
  // rows standing in for a menu roughly four times that size. Worth noting
  // that the DoorDash page rendered a full priced menu while marking the store
  // "not active" for ordering, so an inactive storefront is readable but is
  // also the kind that goes stale; re-extract from a first-party source.
  "3592",
  // 4378 - The Craft Taco. Held 2026-08-27: 21 items, with Burritos, Bowls,
  // Sides and Drinks all rendering zero items on its own Square page. A taco
  // shop with no burritos or bowls, again.
  "4378",
  // 4418 - Ultreya Coffee & Tea. Held 2026-08-27: 15 items, with the tea,
  // matcha and food categories empty. The business is called Coffee AND Tea.
  "4418",
  // 3071 - Jorge's Mexitcatessen. Held 2026-08-27 and the weakest capture of
  // its batch by the agent's own account: DoorDash only, no first-party source
  // reachable, and a virtualized DOM that defeated repeated attempts to render
  // Tacos, Enchiladas, Tortas, Specialties, Sides and Drinks as standalone
  // items - they appear only as choices inside combos. Low confidence and a
  // subset of a delicatessen's menu.
  //
  // Note its recorded website `jorges.top` refused connection, and `.top` is
  // the fabricated-listing shape already documented here. A different real
  // Jorge's ordering site exists but serves another address, and the agent
  // correctly refused to borrow it.
  "3071",
  // The three above share a shape worth naming: an ordering platform whose nav
  // shows the right categories and renders nothing inside them. That is either
  // a closed-store gate or a genuinely unstocked section, and from outside they
  // look identical. Treat an empty category on an otherwise-working page as
  // unread rather than empty, and say which you could not tell.
  //
  // 2315 - Bottlecraft Little Italy. Held 2026-08-27: 29 items off a TapHunter
  // tap list, which the agent correctly labelled a subset - taps and wine only,
  // no bottles or cans.
  //
  // The venue is a BOTTLE SHOP. Its bottle and can selection is not a section
  // of the menu, it is the business. A tap list alone describes the smaller
  // half of what it sells, and TapHunter only ever carries taps, so the source
  // can never be complete here however carefully it is read. Needs the shop's
  // own list.
  "2315",
  // 2467 - Dark Horse Coffee Roasters. Held 2026-08-27: 10 items off its own
  // Square ordering page, missing cappuccino, americano and mocha. The agent
  // labelled it a subset itself.
  //
  // A coffee roaster without the espresso staples is the brewery-without-beer
  // shape, and it is the third time today a drink-led venue has come back with
  // its drinks thinned out - Coffee Bean's sampled, Zumbar's absent, now these
  // missing. The pattern suggests ordering platforms often carry a reduced
  // to-go drink list rather than the full bar, so at a cafe it is worth
  // checking the in-store board before settling for what the app sells.
  "2467",
  // 4699 - Robertacos. Held 2026-08-27: 36 dishes off a dated (Sep 2024) Yelp
  // photo of the drive-thru board, with breakfast items, side orders, several
  // burrito variants and combos #11-16 omitted as too small or blurry to read.
  // The agent named every gap, discarded 2014 and 2018 photos of the same board
  // in favour of the newest, and refused to guess - all correct.
  //
  // It is still a San Diego taco shop missing burritos and combos, which is the
  // Cali's & Fries call again. A sharper photograph of the same board clears it;
  // the DOM-URL technique gets full-resolution images now, which is exactly the
  // tool this needs.
  "4699",
  // 1183 - Star Club. Held 2026-08-27 for two compounding reasons. It is a
  // drink-led dive bar, and the capture has draft and bottled beer but no
  // cocktails or shots - at a bar, that is the missing-core-section rule. And
  // the source is a Sep 2021 photograph, five years old, which is past the
  // point where a drinks list tells you anything about today's prices.
  //
  // Either alone might have been arguable. Together they are not.
  "1183",
  // 3236 - Huapangos. Held 2026-08-27 for the same reason as 3833 and 1977:
  // 94 dishes off menupages.com (tier 5), offered with DoorDash as the
  // cross-check because "markup direction confirms it". Direction is not
  // agreement. The screen passed it because menupages and DoorDash are
  // different companies, which satisfies the same-owner test - but that test
  // exists to stop a source corroborating itself, and clearing it does not turn
  // a direction argument into matching values.
  //
  // Worth noting menupages IS in the allmenus/Grubhub/Seamless family, so if a
  // future cross-check comes back from any of those, it is the same company
  // talking to itself and must be rejected.
  "3236",
  // 3517 - Portal Coffee. Held 2026-08-27: the agent labelled it a SUBSET
  // itself. Espresso, latte, brewed coffee and pastries were captured, while
  // Tea, Bottled Drinks, Coffee Beans, Kids and Breakfast rendered empty -
  // after-hours, which is the closed-store gate rather than a thin menu.
  //
  // The espresso list is the core of a coffee shop, so this is a better capture
  // than most partials. It is held anyway because the cause is known and the
  // fix is free: read it again between 7am and 4pm and the empty categories
  // fill in. Loading now would write a permanent lookup row and stop that
  // second read ever happening.
  "3517",
  // 3833 - Gelati & Peccati. Held 2026-08-27 and REMOVED after loading, on
  // consistency with 1977 and on the Ken Sushi lesson.
  //
  // 23 dishes off sagemenu.com (tier 5, a SinglePlatform mirror) because the
  // shop's own site publishes no prices at all. The cross-check offered was a
  // DoorDash estimated listing running 10-17% higher - which the agent
  // described honestly as agreement in DIRECTION, not in value.
  //
  // That is the same argument that admitted kensushiworkshop.org earlier today:
  // a marketplace sitting a plausible markup above an aggregator, taken as
  // proof the aggregator holds base prices. A dated photograph later showed the
  // .org wrong by up to 56% on individual items and carrying a sake list with
  // no overlap at all. The markup relationship was real and told us nothing
  // about the absolute numbers.
  //
  // A price-direction argument is not a cross-check. Two sources must agree on
  // VALUES to corroborate each other.
  "3833",
  // 3458 - Cali's & Fries. Held 2026-08-27, and this one is closer to the line
  // than the other section-shape holds, so the reasoning matters.
  //
  // 128 dishes across fifteen sections - tacos, tortas, tostadas, combination
  // plates, chips, fries, kids, drinks - read off dated in-store board photos.
  // Missing: "Burritos California" and "Breakfast Burritos", whose prices were
  // illegible in every available photo. The agent said so explicitly, which is
  // exactly right.
  //
  // Proportionally this is far more complete than Mignon Pho (five peripheral
  // sections, no pho) or Ikiru Sushi (no sashimi, rolls or combos). Fifteen of
  // seventeen sections is a good capture by any count. It is held anyway,
  // because at a San Diego taco shop the burrito section is not one category
  // among seventeen - it is the one most people order from, and the shop is
  // named for it. A menu that lists tacos, tortas and fries with no burritos
  // does not read as incomplete to a diner; it reads as a taco shop that does
  // not sell burritos, which is worse than no menu at all.
  //
  // One legible photograph of those two boards clears this. Cheap to fix, and
  // the gap is named, which is why it can be.
  "3458",
  // 2515 - Ikiru Sushi. Held 2026-08-27: 90 dishes read off dated photographs
  // of the physical menu, with Sushi Combo Platters, Sashimi, Cut Rolls and
  // Hand Rolls missing because that column ran off the edge of the folded paper
  // in every available photo.
  //
  // The agent did everything right - it found the only usable source, pulled
  // the photo URLs from the DOM when the lightbox refused, and left the
  // unreadable column out rather than guessing at it. The capture is still a
  // sushi restaurant without sashimi or rolls, which is the Mignon Pho shape
  // again: complete-looking, honestly reported, and missing the sections people
  // actually come for.
  //
  // What would clear it is one more photograph - a different reviewer's shot of
  // the same page, or the unfolded menu. Worth a retry rather than a not-found.
  "2515",
  // 4541 - North Park Beer Co. Held 2026-08-27: 34 food dishes, and no beer.
  //
  // The agent excluded alcohol lists at three venues on one principle - that
  // "dishes" means food - and at two of them that was right: a seafood
  // restaurant and a pub are food businesses with a bar attached. A brewery is
  // not. The beer list is the product, the reason anyone goes, and the thing a
  // diner opens this app to price. Leaving it out is not a conservative choice,
  // it is most of the menu.
  //
  // The rule the briefs already carry - "for a bar or coffee shop the drink
  // list IS the menu" - needed to name breweries and taprooms explicitly, and
  // now does. Note a sibling agent handled California Wild Ales correctly the
  // same afternoon by capturing its tap list, so this is a judgement that
  // varies between agents rather than a gap in what is knowable.
  "4541",
  // 3982 - Mignon Pho + Seafood. Held 2026-08-27: 38 dishes covering Small
  // Bites, Fried Bites, Fries, Seafood Boil and AYCE BBQ, and NO PHO. The
  // restaurant is called Mignon Pho.
  //
  // The agent's reasoning was right at every step - the only priced source for
  // the pho and banh mi sections was an order.online page it had already caught
  // running 1.17x over the real menu photo, so it refused to carry those prices
  // and kept the sections it could verify. That is the correct instinct applied
  // one level too late: a source good enough for half a menu is not good enough
  // for the half that names the restaurant.
  //
  // This is the section-shape rule at its clearest, and a better illustration
  // than Einstein Bros. was: a pho house with no pho. Re-queue and find a
  // source that covers the namesake dish, or record not-found honestly.
  "3982",
  // 4410 Umi Sushi and 2823 Uni Sushi. Held 2026-08-27 on the extracting
  // agent's own closing note: both live menus carry 200+ items, and it recorded
  // "a substantial, representative cross-section of every category rather than
  // every single roll/nigiri variant" - 95 and 41 dishes respectively.
  //
  // This is the sample rule's hardest case, because the usual tell is missing.
  // A thin capture normally announces itself by shape: a bagel shop with no
  // bagels, a cafe with no espresso. Here every category IS represented, so the
  // section check passes and the counts look respectable. What is absent is the
  // long tail inside each category - which, at a sushi bar, is most of the menu
  // and nearly all of what anyone scrolls for.
  //
  // Sampling breadth-first is exactly how a partial capture passes every
  // heuristic we have. The only thing that caught it was the agent saying so.
  "4410",
  "2823",
  // 3694 - Hokkaido Ramen Santouka. Held 2026-08-27 on the agent's own account.
  // It read 107 dishes off a dated (May 2026) photo of the in-store board -
  // good source, right operator, correctly distinguished from the chain's East
  // Coast corporate site - but two cells were too blurry to OCR, and it filled
  // them in with the arithmetic the rest of the board follows: Large = Medium +
  // $1.00, Small = Medium - $1.00, spicy = base + $0.50.
  //
  // That reasoning is careful and probably right, and it is still not reading.
  // "Never write a dish without a real price" does not have a clause for prices
  // you can derive convincingly; the whole point is that the number on the page
  // is the only thing we publish. Re-read the board at higher resolution - the
  // DOM-URL technique gets a full-size image now - and this comes straight back.
  "3694",
  // 3148 - Panini Kabob Grill, Vista. Held 2026-08-27, and this one is a
  // routing decision rather than a quality problem. The capture is 118 dishes
  // off the chain's NATIONAL menu, and the agent said plainly that it never
  // confirmed the Vista store, which has no picker.
  //
  // Meanwhile 3996 (Carmel Valley) already carries 127 dishes pulled from that
  // store's own Olo platform and confirmed to its address. The two records share
  // a name exactly, so propagation will hand Vista the verified store menu for
  // free - and a real branch's menu beats a national approximation. Holding this
  // is what lets that happen; loading it would block propagation with the
  // weaker data.
  "3148",
  // 1979 - Cotijas, East Village. NOT held by id - the markup test already
  // catches it - but recorded here because it is the clearest example of a
  // first-party source carrying a fee. Its own Clover storefront shows every
  // price 4% above the board: $13.51 for a $12.99 item, $10.39 for $9.99,
  // $17.67 for $16.99. See "A restaurant's OWN ordering platform can carry a
  // surcharge" in probe/FINDINGS.md. A retry should look for a dine-in or
  // in-store view; the real prices provably exist one step behind this one.
  //
  // 1977 - Cotijas Taco Shop, Rancho Bernardo. Held 2026-08-27. 125 dishes off
  // allmenus (tier 5), offered with sagemenu.com as the cross-check - but the
  // extracting agent described the agreement as "consistent direction, not
  // exact match", and consistent direction is not agreement. The tier-5 rule
  // asks for two independent sources that AGREE, precisely so a single
  // aggregator's numbers cannot walk in behind a vague second opinion.
  //
  // The agent did good work around it: cotijastacoshops.com and two sibling
  // domains look official but serve Murrieta, Bonita, Temecula, Chula Vista and
  // Torrey Highlands - no Rancho Bernardo - and it refused to borrow that
  // chain's menu. That care is why this is a hold pending a better source
  // rather than a rejection of the capture.
  "1977",
  // 3295 - Zumbar Coffee & Tea. RELEASED same day. The hold was for a ten-dish
  // SinglePlatform capture whose entire drink list was Espresso and Cold Brew,
  // at a cafe reviewed for its lattes - the Einstein Bros. shape. The retry
  // searched properly and reported the opposite of a thin capture: Zumbar's own
  // site has no menu page at all, its joe.coffee ordering says mobile ordering
  // "isn't available here yet", sagemenu.com is the same SinglePlatform mirror,
  // and blog coverage names two or three drinks without a price list. The
  // espresso bar is not published anywhere with prices.
  //
  // So the answer is not-found, and the id must be released for that to be
  // recordable - a held id quarantines the empty entry too, which would re-queue
  // this cafe forever. Releasing on a well-argued negative is as much a part of
  // this set's job as holding on a thin positive.
  // 4042 - Ken Sushi. RELEASED 2026-08-27, same day, and the round trip is
  // worth keeping because every step of it was reasonable.
  //
  // Held first for a 49-dish capture whose sashimi sections the agent itself
  // called short. Its source was kensushiworkshop.org, admitted at tier 5 on a
  // genuinely strong argument: DoorDash divided onto it at a clean 1.20x across
  // all eight overlapping Entrees, descriptions word for word. A second agent
  // then found a dated in-store photo and the .org collapsed against it -
  // Chilean Sea Bass $25 not $16, Ankimo $18 not $10, a sake list with no items
  // in common. The 1.20x agreement had been real but local: a markup
  // relationship confirmed on one section says nothing about the others.
  //
  // A third agent has now read the whole May 2026 laminated set - 136 dishes,
  // every food section - by pulling the photo URLs from the DOM instead of
  // fighting the lightbox that stopped the second. Released; the hold did
  // exactly its job, which was to keep wrong prices out of the corpus for the
  // day and a half it took to find right ones.
  "4678",
  "4861",
  "4684",
  "5675",
  "5413",
  // 5421 - Sarita's Taco Shop. Released 2026-08-25. The hold was for a partial
  // capture; a later pass read all three pages of the PDF menu - combinations,
  // burritos, tacos, quesadillas, enchiladas, tostadas, birria, seafood,
  // breakfast, tortas, specials, drinks, sides - for 159 dishes, and reported
  // that combination plates 1-6, 8-15 and 17-19 carry no printed price at all,
  // recording only the three that do. That is what clearing a quarantine looks
  // like: the same restaurant, read properly, with the gaps named.
  "81",
  "4725",
  // 1262 - Subway. Released: the retry found a 24-hour Chula Vista store and
  // pulled 108 store-priced dishes across 11 sections. The hold was for a
  // 19-item DoorDash capture; this is the same chain read properly.
  "3300",
  // 1277 - Einstein Bros. Released: the retry returned 61 dishes across 7
  // categories INCLUDING actual bagels. The hold was for a 10-item capture
  // that was entirely Hot Coffee & Tea. Only drink categories are missing now.
  // 5620 - El Pollo Loco. RELEASED: 79 dishes across all 13 categories, with a
  // fully priced Chicken Meals section, read from the store's own Olo endpoints
  // (/api/olo/restaurants/<store>/menu and /modifiers) after selecting Chula
  // Vista. That is what defeats the "Price Varies" gate two earlier agents lost
  // to. Twenty-four branches inherit from this.
  // 2964 - Pizza Hut. Released: the retry pinned the store once at 2931 Market
  // St, hit no picker resets, and captured all 9 categories - Melts, Pasta,
  // Desserts, Dips and Drinks included. 52 dishes.
  "4308",
  // 2573 - Fleming's. RELEASED: re-extracted from JSON-LD structured data embedded
  // in flemingssteakhouse.com's own dinner-menu page for the San Diego location.
  // 77 dishes, whole-dollar pricing, none of the .50 rounding that gave the
  // DoorDash capture away. The hold was right and the retry answered it.
  // 4663 - Arrivederci. Its own site embeds TWO different menu screenshots with
  // overlapping but conflicting prices, and the only date available is in a
  // filename: "Screen Shot 2022-12-25". Nearly four years old, and the site
  // itself does not say which of the two is current. A dated photo is only
  // worth its date.
  "4663",
  // 1040 - Cass Street Bar and Grill. RELEASED.
  //
  // The hold assumed a partial capture: eight dishes in two sections for a bar
  // and grill - no salads, no drinks - looked like an agent that had stopped
  // early. A later agent came back with the SAME eight items from a different
  // source (DoorDash rather than gotoeat.net), matching to the cent.
  //
  // So eight is what this restaurant publishes online, not what one agent
  // managed to read. Section shape was still the right question; the evidence
  // has now answered it, and a third attempt would return eight again.
  // 5011 - Panya Thai Kitchen. The site renders prices in a custom font that
  // drops digits, and the agent reconstructed the missing ones "from context and
  // cross-consistency" - honestly reported, and still inference rather than
  // reading. Fifteen of sixty-seven items carry a guessed digit and nothing in
  // the data says which fifteen. The values are all plausible ($14-$26, no
  // dropped magnitudes), which is what makes it dangerous: a wrong one would
  // look exactly like a right one. Re-extract from a channel that renders text.
  // 5011 - Panya Thai Kitchen. RELEASED: a later agent found their real Clover
  // ordering platform (panya-thai-kitchen-escondido.cloveronline.com), which
  // renders prices as ordinary text rather than the digit-dropping custom font
  // on their website. 105 dishes across 13 sections, every price read.
  //
  // Worth keeping as the argument for the rule. Withholding 67 partly-guessed
  // prices cost exactly one wave and returned a complete menu. The reconstructed
  // values had all looked plausible, which is precisely why loading them would
  // never have been caught.
  // 2777 - Konito's Cafe, now Pablo's Cafe. Released 2026-08-26, and the
  // three-name puzzle above resolves rather than survives: all three names are
  // real and only one of them is a different restaurant.
  //
  // 1730 Garnet opened in July 2016 as Konito's, a second location of Kono's
  // Cafe (144, 704 Garnet) started by its owners with their longtime manager
  // Pablo. It has since passed to Pablo and trades as Pablo's Cafe - same
  // suite in the Pacific Plaza centre next to Vons, same phone, same 7am-3pm,
  // and "Konito's Potatoes" still on the menu. Two businesses, 1.8km apart on
  // one street, not one OSM duplicate. Row 2777 is renamed accordingly.
  //
  // So the agent's SOURCE was right and its CHECK was wrong, which is the
  // opposite of how it read. The DoorDash "Pablo's Cafe" store 26088198 is
  // this restaurant's own storefront under its current name - order.online
  // serves the same store id under the Konito's slug. What it then validated
  // against was konoscafe.com, the sister restaurant, and a sister restaurant
  // agreeing about pancakes is not corroboration.
  //
  // Re-extract from pabloscafesandiego.com, which publishes the full menu
  // priced in plain HTML - a tier-1 first-party read, and the reason this is a
  // release rather than a retry of the same third-party capture. The held
  // entry in menus/wip/result-2.json stays unloaded: nothing is wrong with its
  // prices that we know of, but its provenance was never actually established.

  // 3985 - Karami Ramen. Held 2026-08-31 on the agent's own partial flag, and
  // the distinction it drew is the one that matters: it marked Curry, Beverages
  // and Alcohol as UNREAD rather than empty. Those categories exist on the
  // source; they simply never rendered.
  //
  // 16 dishes for a ramen shop, with the ramen itself complete and everything
  // else missing, is a fragment. The site's own Wix page prices every item at
  // $0.00, so Grubhub through r.jina.ai was the only channel - worth retrying
  // when the categories render, or from a different source entirely.
  "3985",
  // 4636 - Kokoro Restaurant. Held 2026-08-31 on the agent's own partial flag,
  // and the shape of the gap is the reason.
  //
  // Its Lunch Menu and Omakase flyer are image PDFs and were read cleanly with
  // the new extract_pdf_images path. The DINNER menu PDF has no embedded images
  // and an empty text layer - genuinely unreadable by anything available here -
  // so 22 lunch-and-omakase dishes came back for a Japanese restaurant whose
  // dinner service is the main event.
  //
  // This is the Flora brunch case again: an honest capture of one daypart,
  // which reads as the whole menu once it is filed. Re-queue; the dinner PDF may
  // be replaced with a readable one, or a photograph may surface.
  "4636",
  // 3334 - Palomino's Mexican & Seafood. Held 2026-08-31 because the agent
  // filed it as a partial and said so in the same breath, which is exactly the
  // behaviour that should get a capture held rather than punished.
  //
  // The sourcing is careful: Yelp menu-board photographs explicitly dated
  // "Menu 2025", with the 2023- and 2017-dated photos in the same gallery
  // deliberately excluded rather than blended - and the right branch confirmed
  // (2615 Sweetwater Springs Blvd, not the permanently closed Kearny Mesa
  // sibling at 3463, which is a trap this record sets for anyone who does not
  // check). Several sections came back illegible or misaligned in the photos -
  // Super Quesadillas, Extras, Sides, Desserts, Drinks and the numbered
  // Breakfast Plates - and were left out instead of guessed.
  //
  // 113 dishes with the breakfast plates and every side missing is most of a
  // menu, and "most of a menu" filed as a whole one is how a diner ends up
  // looking for something that is not there. Re-queue for a clearer photo set.
  "3334",
  // 4381 - We Olive & Wine Bar. Held 2026-08-31 on price level, the rule that
  // overrides every other signal.
  //
  // The live site now dead-ends into a retail shop with no menu, so the agent
  // recovered the old menu page from the Wayback Machine - resourceful, and it
  // reported the age honestly as "~2 years stale". That is the disqualifier.
  // Tandoor and Carmen's were both held for exactly this: an intact, honestly
  // sourced, first-party artefact whose only defect is that nobody can say it
  // is still true. Two years of menu inflation is not a rounding error.
  //
  // The agent's own instincts were right elsewhere in the same entry - it
  // excluded a 2023 wine list with specific vintages as too dated to trust.
  // The food menu is the same class of evidence and deserved the same call.
  //
  // Worth a look at whether this restaurant still serves food at all: a site
  // that has become a shop may be reporting a change of business.
  "4381",
  // 3517 - Portal Coffee. Held 2026-08-31 on the agent's own flag: seven of its
  // categories (Tea Latte, Hot/Iced Tea, Bottled Drinks, Coffee Beans, Kid's
  // Drinks, Veggie Sandwich, Breakfast) came back with zero items, which the
  // agent read as Square-side daypart gating at 1am. That is very likely right,
  // and it is exactly the closed-store gate that has produced partial captures
  // all week. A coffee shop whose menu contains no tea and no breakfast is
  // missing its mornings. Re-queue and take it during opening hours.
  "3517",
  // 2467 - Dark Horse Coffee Roasters. Held 2026-08-31, two defects and either
  // alone would be enough.
  //
  // Its own Square site defaulted to the Normal Heights location with no
  // reachable switcher, so the agent moved to Uber Eats, which address-matched
  // Golden Hill exactly. Seven items came back - drinks only, no food category
  // rendered at all - and the agent said so plainly. Seven dishes from a
  // roaster is a sample, not a menu, and the wrong-location risk is live enough
  // on this business that the next attempt should confirm the branch first.
  "2467",
  // 1674 - JJ's Sushi and Pho. Held 2026-08-31, and this is a price-selection
  // call rather than a sourcing one, which is why it is worth recording.
  //
  // The capture is 100 dishes off dated Yelp menu photographs of the printed
  // dine-in menu, address-confirmed on the menu itself - a genuinely good find
  // for a restaurant with no site and no platform. But one photographed page
  // carried TWO price eras, and the agent resolved it by taking "the
  // higher/majority-agreeing version".
  //
  // That is a choice between two observed numbers, not a fabrication, and the
  // reasoning is defensible. It is still a number selected by an agent rather
  // than published by a restaurant, on a page that proves the menu was
  // reprinted - which means one of the two eras is stale and nothing on the
  // page says which. The picture is worth re-reading with fresh eyes.
  "1674",
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
 * Reads whose source is a DATED PHOTOGRAPH of the physical in-store menu.
 *
 * The ladder in probe/FINDINGS.md ranks "a dated photograph of an in-store
 * menu, where the date can be established" above an undated aggregator page,
 * and it is right to: a photograph of the board on the wall is the restaurant's
 * own pricing, and a date makes it checkable. This file never implemented that,
 * so such a read was judged purely by the host that happened to be carrying the
 * image - usually an aggregator, usually untrusted.
 *
 * Kept separate from CROSS_CHECKED on purpose. That set means "a second
 * independent source agreed". This one means "the source is primary evidence
 * with a date on it", which is a different claim and a stronger one.
 *
 * Rongbranch is the case that forced it: its own domain is a dead GoDaddy
 * placeholder, the only images are two photographs of the printed menu dated
 * three months back, and the agent actively DISPROVED the alternative - allmenus
 * was running 40-100% below the photo, so it was discarded rather than blended.
 *
 * Add here only when the agent states the date and how it was established. An
 * undated photo is worth nothing, and an eight-year-old one is worth less than
 * nothing - a 2018 price board was correctly discarded on exactly this ladder.
 */
/*
 * Menus read from a dated photograph of the real thing - an in-store board, a
 * printed page shot by a reviewer, a menu image the restaurant itself posted
 * with a date on it. Provenance here is better than any web page: it is the
 * restaurant's own printing, and it carries a date, which is the one thing
 * aggregators never do.
 *
 * Membership grants two exemptions. It satisfies the tier-5 cross-check, and it
 * overrides the markup heuristic - see the note at `looksMarkedUp`, where T's
 * Cafe's flat $15 board scored as a 25% platform fee it cannot possibly have.
 */
const DATED_PHOTO = new Set([
  "Rongbranch",
  // T's Cafe - dated zmenu photograph of the in-store board, flat $15 pricing.
  "T's Cafe",
  // Fish Guts - dated reviewer photographs of the printed menu (food Nov 2025,
  // drinks Apr 2026). Dine-in only, no delivery, own site strips prices, Toast
  // page is a bare locator: there is no other priced source in existence. The
  // photos happen to be hosted on Yelp, which is why the narrow biz_photos
  // exemption below exists - see the note at `isDatedYelpPhoto`.
  "Fish Guts",

  /*
   * The three restaurants below were all blocked earlier on 2026-08-27 and all
   * three came back on the same technique: when the photo carousel's lightbox
   * refuses to open, read the image URLs out of the DOM and fetch them. Between
   * them they had cost four agent-attempts to modals that would not open.
   *
   * Every one is a dated photograph of the restaurant's own printed menu.
   */
  // Fathom Bistro - Jun 12 2026 printed menu boards. Its own site lists every
  // dish with descriptions and no prices at all, so this is the only priced
  // source that exists. Food complete; the rotating draft board is omitted and
  // said so.
  "Fathom Bistro",
  // Tacos El Poblano - Jul 25 2025 board, 13 months old and the freshest that
  // exists. Two older photos of the same board show a clear year-over-year
  // increase, which dates it as a real revision rather than something stale.
  // Recorded medium for the age, which is the right call.
  "Tacos El Poblano",
  // Ken Sushi - May 16 2026 laminated menu set, 136 dishes across every food
  // section. This is the capture that finally replaces kensushiworkshop.org,
  // which a dated photo proved wrong earlier today (Chilean Sea Bass $25 not
  // $16, Ankimo $18 not $10, a sake list sharing no items). Wine and sake
  // deliberately skipped and noted rather than silently dropped.
  "Ken Sushi",
  // Rooftop Bar - Dec 2025 photograph of the printed menu. Food and the Apres
  // Surf cocktail/beer/soft-drink list are complete; the venue's separate
  // by-the-glass spirits and wine lists (100+ individually priced pours) were
  // deliberately not transcribed, and the agent said so. That is reference
  // pricing rather than a menu section - a drinker orders from the cocktail
  // list - so this passes where a bar missing its cocktails would not.
  "Rooftop Bar",
]);

/*
 * Hosts that belong to the same company, and therefore cannot corroborate one
 * another. Each inner array is one owner. Used only by the cross-check test
 * below - these hosts are judged on their own merits everywhere else, since
 * being a DoorDash property does not by itself make a storefront wrong.
 */
/*
 * Delivery marketplaces. Two of these agreeing is not corroboration of PRICE,
 * even when the companies are genuinely unrelated.
 *
 * Pho Express arrived off Seamless, cross-checked against DoorDash, matching to
 * the cent on three items - and the agent noted, correctly, that Grubhub and
 * DoorDash are independently owned. The SAME_OWNER test therefore passes it.
 *
 * But markup is a property of the CHANNEL, not of the company. Both
 * marketplaces charge above the counter price, both are fed by the restaurant's
 * own POS, and both will land on the same inflated number. Their agreement
 * establishes that the marketplace price is stable, which is a different claim
 * from the one being made.
 *
 * A marketplace can still be corroborated by a first-party source, and a
 * first-party source needs no marketplace to confirm it. Only marketplace-vs-
 * marketplace is disallowed.
 */
const MARKETPLACE = [
  /(^|\.)doordash\.com$/i,
  /(^|\.)order\.online$/i,
  /(^|\.)caviar\.com$/i,
  /(^|\.)grubhub\.com$/i,
  /(^|\.)seamless\.com$/i,
  /(^|\.)ubereats\.com$/i,
  /(^|\.)postmates\.com$/i,
];

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

/*
 * Blocked entries are appended to a persistent log, because `blocked` on its own
 * has an expensive failure mode.
 *
 * A blocked restaurant writes no ledger row - that is the whole point, it is how
 * it re-queues instead of being retired forever. But it re-queues IMMEDIATELY,
 * so one blocked by a persistent condition comes back every single wave and
 * fails identically each time. Popeyes was blocked three times running by the
 * same store-picker; El Salvador Pupuseria three times by the same res-menu.net
 * outage. Each attempt cost an agent real budget to rediscover a fact already
 * written down.
 *
 * The log is what makes a backoff possible: `scripts/defer-blocked.mjs` reads it
 * and retires anything blocked repeatedly for the same reason, reversibly. The
 * counting has to persist across runs, and this file is otherwise a pure
 * transform that never touches the database - so a log file, not a table.
 */
const blockedThisRun = [];
const unpricedNotes = [];
const dedupeNotes = [];
const BLOCKED_LOG = "menus/blocked-log.jsonl";

/*
 * The domain a restaurant lists as its own is not a brand twin.
 *
 * BRAND_TWIN below is a good instinct with a bad record - three true hits
 * against seven false positives, and every false positive withheld a complete
 * first-party menu. Its own comment names the real test: "the business's real
 * homepage does not link to the domain". That test was being run by hand, once
 * per victim, as a regex appended to an allowlist. Sotos Mexican Food would
 * have been the eighth, and the tell was sitting in our own table the whole
 * time - `restaurants.website` for id 4587 IS `sotosmexicanfood.shop`. Not a
 * domain an agent went and found, the one already on record as the
 * restaurant's site.
 *
 * So check the column instead of the memory. A source host that matches the
 * website we already hold for that restaurant is first-party by definition,
 * whatever its TLD, and the seven false positives collapse into one rule.
 *
 * Kept optional on purpose. This file is otherwise a pure transform that never
 * touches the database, and it is run by hand mid-wave often enough that
 * needing credentials to screen a file would be a real loss. Without
 * DATABASE_URL it degrades to exactly the old behaviour - the hand-written
 * allowlist still works - and says so rather than failing.
 */
const ownDomains = new Map();
if (process.env.DATABASE_URL) {
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT id, website FROM restaurants WHERE website IS NOT NULL`;
    for (const r of rows) {
      try {
        ownDomains.set(String(r.id), new URL(r.website).hostname.replace(/^www\./i, ""));
      } catch {
        /* a malformed website column is not worth failing a screen over */
      }
    }
  } catch (err) {
    console.warn(`could not read listed websites (${err.message.slice(0, 60)}) - brand-twin check falls back to the allowlist`);
  }
} else {
  console.warn("no DATABASE_URL - brand-twin check falls back to the hand-written allowlist");
}

for (const file of files) {
  let entries;
  try {
    entries = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    console.error(`${file}: unreadable - ${e.message.slice(0, 70)}`);
    continue;
  }

  for (const e of entries) {
    /*
     * Dishes carrying no usable price are dropped here rather than loaded.
     *
     * "Market Price", "MP", "Ask your server", an empty string - these are what
     * a real menu prints for the fish of the day, and an agent that records one
     * verbatim is being honest, not careless. But the site's whole promise is
     * that a price answers the question, and "Market Price" answers nothing. It
     * is the same defect as a dash, which once put 200 priceless rows into the
     * corpus and blocked propagation to 271 branches.
     *
     * Dropped per-dish rather than quarantining the restaurant: The Bay View
     * had thirty good prices and one Pasta of the Week. Withholding thirty
     * because of one is the wrong trade. If the drop takes the menu under THIN,
     * the thin-capture rule below catches it on the way past.
     */
    const originalCount = e.dishes?.length ?? 0;
    const priced = (e.dishes ?? []).filter((d) => {
      const n = parseFloat(String(d.price ?? "").replace(/[^0-9.]/g, ""));
      return Number.isFinite(n) && n > 0;
    });
    /*
     * The same dish, twice, in the same section.
     *
     * Toast catalogs can carry a whole menu twice under parallel names that
     * differ only by "online ordering hours" - Park Social served 59 dishes as
     * 118 rows on 2026-08-29. Nothing else here catches that: the prices are
     * real, the sections are real, only the count doubles, and a doubled menu
     * looks like a big menu.
     *
     * Two separate things are needed, because they are different problems.
     *
     * The exact triple - same name, same price, same section - is always a
     * duplicate and is dropped silently. A dish legitimately appearing in two
     * DIFFERENT sections is common and correct (Chilaquiles under both
     * Breakfast and New Items, a caldo under both Caldos and Specials), so the
     * section has to be part of the key or real menu structure gets flattened.
     */
    const seenTriple = new Set();
    const deduped = [];
    for (const d of priced) {
      const key = `${String(d.name).trim().toLowerCase()}|${d.price}|${String(d.section ?? "").trim().toLowerCase()}`;
      if (seenTriple.has(key)) continue;
      seenTriple.add(key);
      deduped.push(d);
    }
    const exactDupes = priced.length - deduped.length;
    if (exactDupes > 0) dedupeNotes.push(`${e.name}: dropped ${exactDupes} exact duplicate row(s)`);

    /*
     * The doubled CATALOG is the other problem, and it survives the triple test
     * because the two copies sit under differently-named sections. Its signature
     * is a large share of rows repeating by name and price alone. A restaurant
     * genuinely listing a third of its dishes twice does not happen; a platform
     * serving two copies of one menu does.
     *
     * Withheld rather than deduped, because if the catalog is doubled we do not
     * know which copy is current - the two "online ordering hours" menus can
     * carry different prices for the same dish, and picking one is guessing.
     */
    const pairKeys = deduped.map((d) => `${String(d.name).trim().toLowerCase()}|${d.price}`);
    const pairDupes = pairKeys.length - new Set(pairKeys).size;
    const looksDoubled = deduped.length >= 20 && pairDupes / deduped.length > 0.3;

    /*
     * One dish name carrying TWO DIFFERENT prices across sections.
     *
     * This is the signal that actually distinguishes the two ways a catalog
     * repeats itself, and it is computed here so `DAYPART_VERIFIED` can never
     * release a menu that has it.
     *
     * A doubled Toast catalog is dangerous because the two "online ordering
     * hours" copies can disagree on price, and picking one is guessing. A real
     * daypart structure repeats a dish at the SAME price (The Henry serves
     * Avocado Toast at $15 on both the weekday breakfast and the weekend brunch
     * menu) - and where a daypart genuinely reprices, the playbook wants both
     * rows kept, which is why Sogno di Vino's $17.95 lunch / $18.95 dinner
     * Arancini must never be silently collapsed.
     *
     * So a conflict is not by itself proof of anything. It is the thing that
     * makes a release unsafe, because a released menu is loaded whole.
     */
    const pricesByName = new Map();
    for (const d of deduped) {
      const n = String(d.name).trim().toLowerCase();
      if (!pricesByName.has(n)) pricesByName.set(n, new Set());
      pricesByName.get(n).add(d.price);
    }
    const priceConflicts = [...pricesByName.values()].filter((s) => s.size > 1).length;
    /*
     * Cleared only when a human checked THIS restaurant and the invariant still
     * holds at run time. The id alone is not enough: if a later re-extraction
     * of a cleared restaurant comes back with conflicting prices, the doubling
     * verdict returns on its own rather than staying switched off.
     */
    const daypartCleared =
      DAYPART_VERIFIED.has(String(e.restaurantId)) && priceConflicts === 0;

    e.dishes = deduped;
    const unpricedDropped = originalCount - priced.length;
    if (unpricedDropped > 0) {
      unpricedNotes.push(`${e.name}: dropped ${unpricedDropped} unpriced`);
    }

    const dishes = e.dishes?.length ?? 0;
    const host = (() => {
      try {
        return new URL(e.sourceUrl).hostname;
      } catch {
        return "";
      }
    })();

    /*
     * A restaurant blocked by something temporary is NOT a not-found.
     *
     * The distinction matters more than it looks. A `not_found` row is
     * permanent - it is precisely what stops the queue re-hunting a restaurant
     * - so recording one for a condition that will have passed by lunchtime
     * removes that restaurant from the project forever, silently.
     *
     * The case that forced this: The Coffee Bean & Tea Leaf and Dairy Queen
     * both hide every price behind store-open status on their ordering
     * platforms. Read at 11pm they look identical to a restaurant with no
     * published menu. Read at noon they extract cleanly. Now that waves run
     * every two hours through the night, an unattended 3am wave would have
     * quietly retired every brand that does this.
     *
     * So an agent that hits a temporary obstacle sets `blocked` to a short
     * reason instead of leaving `dishes` empty and saying nothing. Blocked
     * entries go to quarantine, which writes no ledger row, which re-queues
     * them - the same mechanism a partial capture already uses.
     *
     * This is checked BEFORE the dishes === 0 branch on purpose: a blocked
     * entry has no dishes either, and the empty-menu branch would otherwise
     * swallow it as a clean not-found.
     */
    if (typeof e.blocked === "string" && e.blocked.trim()) {
      quarantine.push({ ...e, quarantineReason: `blocked, not absent: ${e.blocked.trim()}` });
      blockedThisRun.push({
        restaurantId: String(e.restaurantId),
        name: e.name ?? "",
        reason: e.blocked.trim(),
        at: new Date().toISOString(),
      });
      continue;
    }

    /*
     * An empty entry that says nothing is an agent that stopped, not a menu
     * that is absent.
     *
     * A `not_found` is the most expensive thing this pipeline can write: it is
     * the one result that permanently removes a restaurant from the queue, so a
     * wrong one is invisible forever. Twice now a wave has recorded them by
     * accident - once when a result file was loaded while its agent was still
     * working, and again when four agents were killed mid-restaurant by a
     * session limit and left the entry they were partway through on disk.
     *
     * The two are trivially separable, and not by dish count. A real not-found
     * is the END of an investigation, so it always carries prose: which
     * channels were tried, what each returned, why the conclusion is absence.
     * A casualty is the entry the agent had just opened - it has the URL it was
     * about to read and nothing else, because the reasoning had not happened
     * yet. So: no `notes`, no `blocked`, and nothing in `confidence` means no
     * investigation was recorded, and an unrecorded investigation is not
     * evidence of absence.
     *
     * Quarantine writes no ledger row, so these simply re-queue and get picked
     * up by a later wave, which is exactly what should happen to a restaurant
     * nobody actually finished looking at.
     */
    if (dishes === 0) {
      const investigated =
        String(e.notes ?? "").trim() ||
        String(e.blocked ?? "").trim() ||
        String(e.confidence ?? "").trim();
      if (!investigated) {
        quarantine.push({
          ...e,
          quarantineReason:
            "empty and unexplained - no notes, no blocked reason, no confidence. " +
            "Reads as an agent stopped mid-restaurant, not a menu that is absent.",
        });
        continue;
      }
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

    /*
     * A cross-check has to corroborate the PRICE, not the dish names.
     *
     * STP Bar & Grill arrived sourced from allmenus with `crossCheckedAgainst`
     * pointing at the restaurant's own site - a genuinely independent host, so
     * every test above passed it. But the agent had written the truth into the
     * field itself: "dish names/descriptions match verbatim ... but the
     * official site itself carries no prices anywhere". The names were
     * confirmed twice and the prices exactly once, by an untrusted aggregator,
     * on a site whose entire promise is the price.
     *
     * This is a text heuristic reading the agent's own annotation, which is
     * frankly a weak instrument - it works here only because the agent was
     * scrupulous about saying what it had not established. The structural fix
     * is a separate boolean on the entry declaring whether the second source
     * carried prices, so honesty is not a matter of whether prose happens to
     * match a regex. Until then, this catches the case that actually occurred.
     */
    const disclaimsPrice =
      /no price|without price|carries no price|zero price|not independently|names only|name.{0,10}only|dish names/i.test(
        String(e.crossCheckedAgainst ?? ""),
      );

    /*
     * The markup test, run mechanically instead of trusted.
     *
     * Every extraction brief tells agents to divide by 1.1/1.15/1.2/1.25 and
     * reject prices that land on round dollars. Two agents in one wave reported
     * running it and shipped marked-up menus anyway: Fleming's (47 dishes off
     * DoorDash) and Mariscos & Birria El Prieto, whose 44 prices divide by 1.25
     * onto round dollars 38 times - a $3.99 taco listed at $4.99. Both were
     * caught by hand afterwards, which is not a system.
     *
     * It runs on EVERY host, not just marketplaces, and that was a correction.
     * Mr. Shawarma came off `smartonlineorder.com` - the restaurant's own
     * ordering platform, tier 2, the kind of source this file trusts most - and
     * 67 of its 72 prices divide by 1.04 onto whole dollars. $13.52 is $13, and
     * $12.48 is $12. The platform bakes a 4% fee into every displayed price.
     *
     * First-party does not mean unmarked-up. It means nobody is taking a cut on
     * the way past, which is a different claim from "this is what you pay at the
     * counter".
     *
     * The false-positive risk of running this everywhere is small enough to
     * ignore: for an arbitrary price, landing within a cent of a round dollar
     * after division happens about 2% of the time, so a 60% threshold is not
     * reachable by coincidence on a real menu.
     *
     * Note what this does NOT catch, and why the cent-ending spread is still
     * worth a human eye: Fleming's marked up and then rounded to the nearest
     * fifty cents, which erases the divisor entirely (1.25 hit only 8 of 47).
     * The two tests fail on different cases. This one is mechanical; that one
     * lives in the QUARANTINE_IDS notes.
     */
    let markupRatio = null;
    {
      const all = (e.dishes ?? [])
        .map((d) => parseFloat(String(d.price ?? "").replace(/[^0-9.]/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);

      /*
       * WHOLE-DOLLAR PRICES CANNOT BE EVIDENCE OF MARKUP, so they are excluded
       * before the ratio is taken.
       *
       * A round price divides onto another round price for free: $5/1.25 = $4,
       * $10/1.25 = $8, $15/1.25 = $12, $20/1.2 = $16. The test asks "does this
       * look like some base price times a round multiplier", and a whole-dollar
       * menu answers yes no matter who set it. Pal Joeys - a dive bar pricing
       * its happy-hour board in whole dollars, on its OWN site - scored 5 of 8
       * and was withheld for a delivery fee it cannot have.
       *
       * This is the same failure as T's Cafe's flat $15 board, one level deeper:
       * there the whole menu was one repeated price, here it is a family of
       * round ones. Bars, happy hours, $1 oyster nights and taco Tuesdays all
       * price this way, so the exclusion matters for a whole category of venue.
       *
       * What survives is the informative case: a price with real cents on it.
       * $13.51 dividing to $12.99 says something. $10 dividing to $8 does not.
       */
      /*
       * DISTINCT prices only, and whole dollars excluded.
       *
       * Repeating a price does not repeat the evidence. Village Indian Cuisine
       * scored 29 of 31 at 1.25 off its own ordering platform, which reads as a
       * flat 25% platform fee - but 31 prices collapse to SIX distinct values,
       * and most of the hits were one $89.99 catering item listed over and
       * over. A menu with six prices on it cannot support a conclusion about a
       * multiplier; counting each appearance separately just manufactures
       * confidence.
       *
       * The remaining `.99` problem is worth naming because it is not fixable
       * by counting. This test asks whether a price is a round base times `m`,
       * with a one-cent tolerance - and `.99` pricing sits one cent below a
       * round number by design. $19.99 reads as $20, and $20 is exactly 16 x
       * 1.25. So any menu using `.99` prices whose next dollar is divisible by
       * five ($19.99, $24.99, $89.99) will hit at 1.25 no matter who set it.
       *
       * That same one-cent tolerance is what catches the real cases - Cotijas'
       * $13.51 reads as $12.99 x 1.04 - so it cannot simply be tightened. The
       * defence is sample size instead: a genuine surcharge shows up across a
       * broad spread of distinct prices, while the `.99` artefact shows up
       * across a handful.
       */
      const values = all.filter((n) => Math.round(n * 100) % 100 !== 0);
      const distinct = new Set(values.map((n) => n.toFixed(2))).size;

      /*
       * The ratio counts every price; the GATE counts distinct ones.
       *
       * Deduplicating before taking the ratio was tried and made things worse,
       * which is worth recording because it sounds like the obvious fix. In a
       * genuine surcharge every price is marked up, so repetition is real
       * evidence and discarding it discards the case: deduped, Cotijas' true
       * 4% fell to 0.45 and George Burgers' true 20% to 0.38, while Village
       * Indian's false positive ROSE to 0.67 and became the strongest signal of
       * the three. The ratio needs the repeats.
       *
       * Price DIVERSITY is the thing that actually separates them. A menu with
       * sixty distinct prices that mostly divide by 1.04 is describing a real
       * multiplier; a menu with six, four of which end `.99`, is describing
       * nothing at all - `.99` sits one cent below a round number by design,
       * and round numbers divisible by five are multiples of 1.25.
       *
       *   Cotijas       60 distinct -> 137/213 = 0.64  fires   (real)
       *   George Burgers 16 distinct ->  63/83  = 0.76  fires   (real)
       *   Village Indian  6 distinct -> skipped          passes (false)
       */
      /*
       * THE SAME FEE ARRIVES IN TWO ARITHMETICS, and only one of them is a
       * round multiplier.
       *
       * A 4% service fee can be charged as `base * 1.04`, or as
       * `base / 0.96` - which is `base * 1.0416…`, and 1.0416 is not 1.04.
       * Surf Side Deli's own Clover storefront uses the second form: 62 of its
       * 63 prices land on a real price point when divided by 25/24, and only 10
       * do at 1.04. It was filed clean by this screen, loaded, and had to be
       * deleted afterwards.
       *
       * So the list below carries both families. The fractions are written as
       * fractions rather than as decimals because 25/24 typed out to four
       * places is 1.0417, which does not divide $15.62 back onto $15.00.
       */
      if (values.length >= 12 && distinct >= 12) {
        for (const m of [1.04, 1.05, 1.08, 1.1, 1.15, 1.2, 1.25, 25 / 24, 100 / 97, 100 / 95, 100 / 90]) {
          const hits = values.filter((n) => {
            const v = n / m;
            return Math.abs(v - Math.round(v)) < 0.011;
          }).length;
          const ratio = hits / values.length;
          if (ratio > (markupRatio?.ratio ?? 0)) markupRatio = { m, ratio, hits, of: values.length };
        }
      }
    }

    /*
     * A SECOND, INDEPENDENT SIGNAL: does this menu price like a menu at all?
     *
     * Restaurants set prices on conventional endings - .00, .25, .50, .75, .95,
     * .99. A surcharged catalog does not: multiplying every price by a fee
     * scatters the cents almost uniformly. That shape is what actually caught
     * the two captures this screen let through on 2026-08-31.
     *
     *   IB Thai      1% of prices on a conventional ending as published, 73% after ÷1.04
     *   Surf Side    5% as published, 98% after ÷(25/24)
     *
     * The test above asks whether some multiplier lands prices on whole
     * dollars, which misses a menu built on .99 endings. This one asks whether
     * the prices look set by a human, and only calls it a fee when dividing
     * makes them look dramatically MORE human. Both conditions have to hold, so
     * a restaurant with genuinely odd pricing and no clean divisor is left
     * alone.
     */
    let surchargeShape = null;
    {
      const ENDINGS = new Set([0, 25, 50, 75, 95, 99]);
      const onEnding = (arr) =>
        arr.filter((n) => ENDINGS.has(Math.round(n * 100) % 100)).length / arr.length;
      const all = (e.dishes ?? [])
        .map((d) => parseFloat(String(d.price ?? "").replace(/[^0-9.]/g, "")))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (all.length >= 20) {
        const published = onEnding(all);
        if (published < 0.2) {
          for (const m of [1.03, 1.035, 1.04, 1.05, 1.06, 1.08, 1.1, 1.15, 1.2, 1.25, 25 / 24, 100 / 97, 100 / 95, 100 / 90]) {
            const divided = onEnding(all.map((n) => Math.round((n / m) * 100) / 100));
            if (divided > 0.6 && divided > published + 0.4 && divided > (surchargeShape?.divided ?? 0)) {
              surchargeShape = { m, published, divided, of: all.length };
            }
          }
        }
      }
    }
    /*
     * A FLAT-PRICE MENU DEFEATS THE MARKUP TEST, and the test cannot tell the
     * difference. T's Cafe prices most of its brunch, sandwiches and salads at a
     * flat $15; 31 of its 45 prices therefore divide by 1.25 onto $12, which
     * scores 0.69 and reads as a textbook 25% platform fee. It is not one. The
     * source is a dated photograph of the physical board in the cafe, and a
     * photograph of a board cannot carry a delivery fee.
     *
     * The test asks "do these prices look like some other number times a round
     * multiplier". Any menu built on one repeated round price answers yes to
     * that for free, because a single value times any multiplier is still a
     * single value. Flat-price boards, one-price taco nights and $1 oyster
     * happy hours will all trip it.
     *
     * So a dated first-party photograph outranks the markup heuristic: the
     * heuristic infers a fee that the evidence rules out. DATED_PHOTO already
     * exists for exactly this kind of "we can see the real thing" exemption.
     */
    const priceProvenanceBeatsHeuristic =
      DATED_PHOTO.has(e.name) || CROSS_CHECKED.has(e.name);
    const looksMarkedUp =
      (markupRatio?.ratio ?? 0) > 0.6 && !priceProvenanceBeatsHeuristic;

    const bothMarketplaces =
      MARKETPLACE.some((re) => re.test(host)) && MARKETPLACE.some((re) => re.test(secondHost));

    const secondIsIndependent =
      Boolean(secondHost) &&
      !disclaimsPrice &&
      !secondIsSibling &&
      !bothMarketplaces &&
      !UNTRUSTED.some((re) => re.test(secondHost)) &&
      !BARRED.some((re) => re.test(secondHost)) &&
      !BRAND_TWIN.test(secondHost);

    const verified =
      secondIsIndependent || CROSS_CHECKED.has(e.name) || DATED_PHOTO.has(e.name);

    /*
     * The Yelp bar is aimed at Yelp's MENU TAB, and the note above says why:
     * that data is user-submitted, undated, sometimes years old. Staleness is
     * the whole objection.
     *
     * A dated photograph of the restaurant's printed menu, which a reviewer
     * happened to upload to Yelp, is not that. Fish Guts is dine-in only, runs
     * no delivery, strips prices from its own site and has a bare Toast
     * locator - there is no priced source anywhere - and a reviewer's photos of
     * the physical menu carry dates (food Nov 2025, drinks Apr 2026) and the
     * restaurant's own printing. That is better provenance than most tier-2
     * pages, and it answers the exact objection the bar exists to raise.
     *
     * So the exemption is deliberately narrow: the entry must be named in
     * DATED_PHOTO (a human looked at it) AND the URL must be a `biz_photos`
     * path. A plain `yelp.com/biz/...` menu tab still fails, which keeps the
     * rule that actually matters intact.
     */
    /*
     * A `/biz_photos/` URL clears the Yelp bar on its own.
     *
     * This first required the restaurant to ALSO be named in DATED_PHOTO, which
     * was wrong in a way that only showed up once agents started citing photo
     * URLs properly. Soups and Such Cafe was read off dated in-store board
     * photographs and cited
     * `yelp.com/biz_photos/soups-and-such-cafe-julian?tab=menu` - precisely the
     * evidence the rule asks for - and was barred anyway, because nobody had
     * hand-added its name. A rule that only passes restaurants somebody
     * remembered to allowlist is not a rule, it is a queue of my attention.
     *
     * The bar exists to keep out Yelp's MENU TAB: user-submitted, undated,
     * sometimes years old. `/biz_photos/` is definitionally not that tab, and
     * the path is machine-checkable in a way a promise in a report is not. So
     * the URL alone is sufficient, and DATED_PHOTO goes back to doing its other
     * job - overriding the markup heuristic where a photograph proves a fee
     * cannot exist.
     */
    const isDatedYelpPhoto = /\/biz_photos\//i.test(String(e.sourceUrl ?? ""));

    // Exact host match against the website we hold for THIS restaurant - not a
    // suffix test, so a squatter cannot qualify by hanging the real domain off
    // the end of its own.
    /*
     * Two conditions, and the second is the one that matters.
     *
     * Matching the listed host alone was not enough. 109 restaurants list a
     * website on one of these TLDs, and an audit of them turned up
     * `timkynoodlesandiego.bestcafes.online` - a content farm that had been
     * scraped into our own `website` column, which the exemption would then
     * have waved through on our own authority. The farm's tell is structural:
     * the restaurant's name is the SUBDOMAIN and the registrable domain
     * underneath it (`bestcafes.online`) has nothing to do with the business.
     * A restaurant's own domain is named after the restaurant.
     *
     * A shared-parent test was tried first and does not work - the farm hosted
     * exactly one restaurant in our corpus, so multi-tenancy caught nothing.
     * Name-matching the registrable label does: `sotosmexicanfood` matches
     * Sotos Mexican Food, `bestcafes` matches nothing about Tim Ky Noodle. It
     * is also what every entry on the hand-written allowlist has in common,
     * which is a good sign it was the real rule all along.
     */
    /*
     * The exemption trusts `restaurants.website`, and that column can be wrong.
     *
     * Within an hour of shipping the rule above, an agent found three listed
     * `.shop` domains that 301 to auto-generated directory farms
     * (`locallya.com`, `placejoys.com` - "12,480+ places, updated weekly",
     * Claim-This-Listing buttons) and a fourth parked for sale. All four would
     * have name-matched their restaurant and been waved through on our own
     * authority.
     *
     * A pure file transform cannot see a redirect, so this cannot be fixed
     * here. It is fixed in two places instead: the farm hosts are BARRED below,
     * which catches the source URL an agent would actually cite, and the four
     * bad `website` values were nulled in the database so the exemption has
     * nothing to trust. The general lesson is that the column is a claim, not a
     * fact - an agent that follows the link is the only thing that can check
     * it, and one did.
     */
    const listedHost = ownDomains.get(String(e.restaurantId));
    const bare = host.replace(/^www\./i, "");
    const sld = bare.split(".").slice(-2, -1)[0] ?? "";
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameKey = norm(e.name ?? "");
    const sldKey = norm(sld);
    /*
     * Whole-string containment was too strict to survive real domains. A
     * restaurant buys `mauricios1mexicanfood.shop` with a digit dropped in the
     * middle, or trades under "La Imperial Taqueria" at
     * `taquerialanuevaimperial.shop` with the words reordered and one added.
     * Both are obviously the business's own domain and neither contains the
     * other end to end.
     *
     * So match on a WORD instead: one token of five characters or more, shared
     * between the name and the registrable label. Five is doing real work -
     * "taco", "cafe", "shop", "grill" are shorter than that or generic enough
     * to appear in a farm's domain by accident, and the whole point is to
     * separate a name from a category. `bestcafes` shares no five-letter word
     * with "Tim Ky Noodle", which is the case this exists to stop.
     */
    const words = nameKey.length >= 5 ? [nameKey] : [];
    for (const w of String(e.name ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 5) words.push(w);
    }
    const domainIsNamedForTheRestaurant =
      sldKey.length >= 5 &&
      words.some((w) => sldKey.includes(w) || (w.length >= 5 && w.includes(sldKey)));
    /*
     * A SUBDOMAIN of the listed website is still the restaurant's own.
     *
     * Exact-host matching withheld Melo Melo: its site is a client-side React
     * app, and an agent grepped the JS bundle to find the real backend at
     * `manage.melomelo.us/api/products` - a textbook application of the
     * documented technique, producing a first-party capture from the
     * restaurant's own API. The brand-twin rule then fired on the `.us` TLD
     * because the API host is not character-for-character the listed one.
     *
     * Comparing the registrable domain instead covers every ordering, API and
     * regional subdomain a restaurant runs under its own name, and gives up
     * nothing: a squatter would have to control the restaurant's actual domain
     * to benefit, at which point it is not a squatter.
     */
    const registrable = (h) => h.split(".").slice(-2).join(".");
    const isOwnListedDomain =
      Boolean(listedHost) &&
      registrable(bare) === registrable(listedHost) &&
      domainIsNamedForTheRestaurant;

    let reason = null;
    if (looksMarkedUp)
      reason =
        `markup or platform fee: ${markupRatio.hits}/${markupRatio.of} prices divide by ` +
        `${markupRatio.m} onto round dollars (${host})`;
    else if (surchargeShape && !priceProvenanceBeatsHeuristic)
      reason =
        `prices are not shaped like a menu: only ${(100 * surchargeShape.published).toFixed(0)}% of ` +
        `${surchargeShape.of} land on a conventional ending, but ${(100 * surchargeShape.divided).toFixed(0)}% do ` +
        `after dividing by ${surchargeShape.m.toFixed(4)} - looks like a fee baked into every price (${host})`;
    else if (BARRED.some((re) => re.test(host)) && !isDatedYelpPhoto)
      reason = `barred source (${host}) - see BARRED`;
    else if (looksDoubled && !daypartCleared)
      reason =
        `catalog looks doubled: ${pairDupes} of ${dishes} rows repeat by name and price ` +
        `across differently-named sections - see the Toast duplicate-menu finding` +
        (priceConflicts === 0
          ? ` (no dish carries two different prices, so if these are real dayparts ` +
            `rather than two copies of one menu, verify and add the id to DAYPART_VERIFIED)`
          : ` (${priceConflicts} dish name(s) carry two different prices - do NOT release this one)`);
    else if (QUARANTINE_IDS.has(String(e.restaurantId)) && !RELEASED_IDS.has(String(e.restaurantId)))
      reason = "held by id - see QUARANTINE_IDS";
    else if (KNOWN_PARTIAL.has(e.name)) reason = "extraction was truncated - see KNOWN_PARTIAL";
    else if (INFERRED_PRICING.has(e.name)) reason = "prices were derived, not read - see INFERRED_PRICING";
    else if (!verified && UNTRUSTED.some((re) => re.test(host)))
      reason = `untrusted aggregator (${host})`;
    else if (!isPlatform && !isOwnListedDomain && BRAND_TWIN.test(host))
      reason = `brand-twin domain (${host})`;
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

if (unpricedNotes.length > 0) {
  console.log(`\nunpriced dishes dropped (kept the rest of each menu):`);
  for (const n of unpricedNotes) console.log(`  ${n}`);
}

if (dedupeNotes.length > 0) {
  console.log(`\nduplicate rows dropped (same name, price and section):`);
  for (const n of dedupeNotes) console.log(`  ${n}`);
}

if (blockedThisRun.length > 0) {
  const entries = blockedThisRun.map((b) => `${JSON.stringify(b)}\n`).join("");
  await appendFile(BLOCKED_LOG, entries, "utf8");
}

const dishCount = (a) => a.reduce((s, e) => s + (e.dishes?.length ?? 0), 0);
const notFound = clean.filter((e) => (e.dishes?.length ?? 0) === 0).length;

console.log(
  `clean:      ${clean.length} entries (${clean.length - notFound} with menus, ` +
    `${notFound} confirmed not-found), ${dishCount(clean)} dishes\n` +
    `quarantine: ${quarantine.length} entries, ${dishCount(quarantine)} dishes withheld\n`,
);
for (const q of quarantine) {
  /*
   * `dishes` is optional, not merely sometimes-empty. An agent that finds
   * nothing may omit the key rather than write `[]`, and on 2026-08-29 one did
   * - crashing the summary AFTER the screen had already decided everything and
   * written both output files. The run looked like a failure and was not, which
   * is the worse of the two ways to be wrong: the next step is a load, and a
   * screen that appears to have died invites re-running it against a clean.json
   * that is already correct.
   */
  console.log(`  ${q.name} (${q.dishes?.length ?? 0} dishes) - ${q.quarantineReason}`);
}
