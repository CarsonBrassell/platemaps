# Menu extraction playbook

The operational distillation of `probe/FINDINGS.md`. **Extraction agents read
this, not FINDINGS** — FINDINGS is now ~27,000 tokens across 89 sections, and
telling every agent to read it in full spent a quarter of a context window
before any work began. Four agents died mid-run on the day that was noticed.

FINDINGS stays as the archive: the reasoning, the failed approaches, the cases
each rule came from. Consult it for a specific question. Do not read it whole.

**When you learn something new, append it to FINDINGS and, if it changes what an
agent should DO, edit the corresponding line here.** This file must stay short
enough to read; if it grows past roughly 400 lines, something in it has stopped
earning its place.

---

## 1. The one unrecoverable mistake

`not_found` retires a restaurant **permanently** — it never gets queued again.
Recording one for a limitation of *yours* rather than of the restaurant is the
only error here that cannot be undone by a later pass.

- **`blocked`** — anything temporary: a closed-store price gate, a host down or
  403-ing, a reproducible backend error, a page that stopped responding, a TLS
  failure, "needs a browser". These re-queue.
- **`not_found`** — a business that publishes no per-item prices anywhere (a
  drink-only dive bar, a buffet with one all-in price, a lounge with
  all-inclusive food, a fine-dining room that prices only the caviar), a
  permanently closed business, or a dead domain with no alternative source.
  Put the reason in `notes` — an unexplained empty entry is withheld downstream
  as "agent stopped mid-restaurant", so the note is what makes your finding
  count.

A closed restaurant whose address now hosts a differently-named successor is a
not-found for *this* record, not permission to borrow the successor's menu.

## 2. Write the file after every restaurant

Your narration is not output. The result file is. Write it after restaurant 1,
before you begin restaurant 2, and rewrite it after each one.

Four agents on one day captured real menus, died, and had written nothing —
every one of those captures was lost and those restaurants went back on the
queue. On the same day, six agents were killed by a session limit and four had
usable files on disk; 3,333 dishes were recovered from them.

Verify what you wrote: parse it back and confirm every price matches
`/^\$\d+(\.\d{2})?$/`. Shell quoting once mangled an entire batch into
`$undefined.00`.

## 3. Never dump a page into your context

Fetch to a file, extract with a script, print only the rows.

```
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" "<url>" -o /tmp/p.html
node /tmp/extract.js          # prints one line per dish
```

Write extraction scripts to a `.js` file and run them; `node -e "…"` gets
mangled by shell quoting. Grep narrow windows — a few hundred characters, never
hundreds of thousands. This applies to JSON-LD blocks, `/products.json`, Clover
dumps and PDF text equally.

**Use full explicit Windows paths for every scratch file.** A bare `/tmp/x.html`
resolves inconsistently here — sometimes to the real temp directory, sometimes
to a literal `C:\tmp` that does not exist, sometimes to the project root — and
it has cost several agents real time chasing phantom "file not found" errors.
Write to `C:/Users/Calvin  Lensink/AppData/Local/Temp/...` and read from the
same string. Split very long heredocs into smaller chunks while you are at it.

**And give every scratch file a prefix unique to you** — your result number is
ideal (`wip102-page.html`, `wip102-extract.js`). Sibling agents share that temp
directory and generic names collide: one agent's `extract1.js` was overwritten
mid-run by another agent's script.

**Do not trust a scratch file you did not write.** A leftover `chula-menu.pdf`
looked like a pre-fetched menu for a Chula Vista restaurant and turned out to be
an unrelated taqueria. Fetch your own.

## 4. Verify a summarized price — but verify it correctly

**WebFetch and WebSearch return summaries, not pages**, so a price from one is a
claim until you check it. The check itself is where this goes wrong.

**Strip the tags before you search.** A page can render `$` and `16` in separate
elements, so grepping raw HTML for `$16` finds nothing on a page that plainly
displays $16. That exact mistake produced this project's loudest false alarm: an
agent reported that WebFetch had *fabricated* a complete priced menu for
Whiskers and Wine Bar, the conclusion was written up as a fabrication finding
and propagated into a dozen briefs — and the prices were on the page the whole
time, `$</span> <span>16`. A later agent read all 58 of them off the same URL.

So the routine is: `curl` the page, strip tags
(`h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')`), then look for the figure.

**What is genuinely established:** a summary can attribute prices to the wrong
business. WebSearch reported happy-hour specials for a bar whose own listing had
none — those prices belonged to *other nearby bars* in a "nearest happy hours"
widget on the same page. So confirm the price is on the page **and** that it
belongs to **your** restaurant.

If a page really is image-only, read the image. But establish that it is
image-only by stripping tags first, not by a raw grep.

## 5. Source ladder

1. The restaurant's own site — HTML, PDF, or menu images.
2. Its own ordering platform — Toast, Clover, Square, ChowNow, Slice, SpotOn,
   SkyTab, Popmenu, Owner.com, Olo, MenuStar, SpotHopper, menu11, NetWaiter,
   MealKeyWay, Blizzfull, Snackpass, HungerRush.
3. A white-label delivery storefront (order.online, DoorDash) that passes the
   markup check. `medium` at best.
4. SinglePlatform / restaurant-submitted directory data. `medium` — **but treat
   it as stale until proved otherwise.** It is restaurant-submitted and often
   years old: $1.25 coffee at one cafe, and 1.4–1.7× below current at another,
   both in a single batch. A third had its widget serving the full item list
   with every price stripped but one. Always price-level check it, and prefer
   almost anything else that is current.
5. allmenus, sagemenu, menupages, menupedia. `low`, and **only** with two
   independent priced sources that agree.

**Tier 5 independence is by OWNER.** allmenus / Grubhub / Seamless / MenuPages
are one company. DoorDash / order.online / Caviar are one. Uber Eats /
Postmates are one. Two of them agreeing is a copy talking to itself, and it
will agree to the cent — which looks like strong evidence and is none.

**Two ORDERING CHANNELS agreeing does not clear a markup either**, even when
they are different companies and one is the restaurant's own platform. Pacific
Pizza's own Slice storefront matched DoorDash to the cent on every item — and
both carried the same 20% uplift, which is exactly why they agreed. The
distribution gave it away: 58 prices ending `.20`, `.60`, `.40`, `.80`, `.00`,
with 48 landing on a whole dollar when divided by 1.2. The restaurant prices in
whole dollars.

The cross-check that means something against a markup is a **dine-in artefact** —
a printed menu, a board photograph, a PDF the restaurant hands out. Ladder
position describes how close a source sits to the restaurant, not whether the
number on it is the one on the wall.

`crossCheckedAgainst` takes a **priced** source. A page with no prices can date
a menu or confirm its section list — put that in `notes` — but it cannot
corroborate a number it does not contain.

If only one tier-5 source is reachable, say so and mark blocked. That is a real
finding, not a failure.

## 6. Prices that are not the price

**Markup test, on every source including the restaurant's own platform — and on
each MENU within it separately.** Markup can be scoped to one named sub-menu
inside an otherwise-legitimate first-party catalog. One Toast storefront carried
a menu literally called "Delivery Brunch" whose 70 items divided by 1.10 onto
round or half-dollar values with **zero exceptions**, while a sibling "A LA
CARTE" menu in the same catalog showed no such pattern. Testing the catalog as a
whole would have averaged that away.

Divide by 1.04 / 1.1 / 1.15 / 1.2 / 1.25 and see whether prices land on round
or `.95`-ending values. Real catches: a uniform 1.10 across 82 of 84 items;
1.15; 1.17; 1.30; and three restaurants whose **own** Clover or SpotOn
storefront ran a clean 1.04 — a 4% online-ordering surcharge, not the price on
the wall. POS-style odd cents with no consistent divisor passes.

**A 2×+ gap between two sources is staleness, not markup.** No fee is 120%. The
cheaper one is an old page.

**Price level dates a source, and this overrides every other signal.** One
restaurant's own site is intact, first-party, complete, and prices every item —
samosas $2.99, entrees $5.89–$14.99 — and dates to roughly 2010. Nothing but
the numbers gives it away. Implausible price level means blocked, whatever else
the source has going for it.

**Disagreement is information.** Two sources differing sharply on the same dish
(Karaage $16.00 vs Chicken Karaage $8.75) means what you can see is unreliable,
not a small true sample. Blocked, not a partial.

## 7. What counts as a complete menu

**Section shape matters more than dish count.** A taqueria with no burritos, a
sushi house with no nigiri, a pho house with no pho, a Korean chicken place with
no bibimbap, a bagel chain whose ten items are all coffee — each is a partial
however the count reads.

Check the restaurant's **own site** for its real section list even when that
site prices nothing, then check your source against it. **A delivery listing
carries only the sections the restaurant chose to put on that marketplace** —
one had 5 of the restaurant's 12.

**Core vs adjunct is the line.** Missing an adjunct makes the answer
incomplete; missing a core section makes it *wrong*, because the rows that are
there read as the whole menu. Lunch, brunch, happy hour and a separate American
menu are **menus**. A bottle-service list, a back-bar liquor reference, retail
merchandise and party trays are **adjuncts** — exclude them and say so.

Running out of time is a reason to mark blocked, not to file a partial as
complete.

**A representative sample is not a menu.** If price appears only on a per-item
click across 150 items and you can read 10, that is `dishes: []`.

**But a small menu can be the whole menu** — a dive bar with nine priced
drinks, a dessert shop with twelve items. Say so in `notes`.

**In your report, list the categories you reached AND the ones you did not.**
That single line is what catches partials. Every partial caught has been caught
that way; every one that slipped through came from a report that omitted it.

## 8. Menus that are hiding a slice

Four platforms show you part of a menu in a way that looks complete:

- **Toast time-gating** — serves only the currently-serving daypart. A
  complete-looking lunch menu with breakfast and supper silently absent.
  Nothing downstream detects this. Check posted hours against what you were
  shown; if you got one daypart, mark blocked and name the missing windows.
- **Wix menu widgets** — only the ACTIVE tab is in the HTML. The rest are at
  `?menu=<slug>` URLs, each independently server-rendered.
- **Popmenu** — JSON-LD carries business info and a 3-item "popular" sample per
  menu; the items are client-fetched. It does expose real per-section item
  counts, which is useful for judging completeness.
- **Toast duplicate catalogs** — one served the same 59 dishes twice under
  parallel "online ordering hours" menu names. Check before flattening.

**Check a "Most Ordered" carousel before stripping it.** It is usually a
duplicate sample of items that also appear in the real categories, and dropping
it is right — but not always. One Submarina listing's 12-item carousel held
**5 items that appeared nowhere else**: two sides, a dessert, a drink and one
sandwich size. Diff it against the categorised items and keep whatever is
unique, rather than dropping the section on sight.

**Empty vs unread:** a category rendering no items is usually UNREAD, not empty.
Many platforms publish per-category item COUNTS — if the count says 0, it is
genuinely empty. Say which you established and how.

**Empty vs gated** is a third state and they look identical from outside. Both
show "ordering not available". A Clover storefront behind a closed-store gate
still has the data — the REST path returns it. A SpotHopper (`spotapps.co`)
embed can evaluate cleanly and contain a genuinely empty `menus: []`, meaning
the restaurant never populated it. The first is `blocked` until trading hours;
the second will never fill in, so look elsewhere.

## 9. Server-rendered payloads — try these before concluding anything

The highest-value habit here: **watch what a page fetches, not what it
renders.** A JS shell showing nothing is usually talking to a JSON endpoint.

| Platform | Where the menu is |
|---|---|
| Any own site | JSON-LD in the page source — 225 dishes at one restaurant where rendered HTML held a fraction |
| Toast | `window.__OO_STATE__` — 403s a bare curl, **200 with a real Chrome UA**. Deployments differ: some embed the full catalog (229 dishes at one), others hold only restaurant metadata with items fetched client-side. Check what is in the blob before concluding either way |
| Slice, on the restaurant's own domain | a `"menuRequest":{"data":{"categories":[…]}}` blob in the served HTML, products carrying `price` as a `"$13.99"` string — a different embedding from the one below, and readable by plain curl |
| Slice | `__SLICE_REDUX_STATE__` or schema.org JSON-LD — **when present.** Some `slicelife.com` storefronts are pure client-side React with neither. Two in one batch had nothing to read; three others gave up 92, 121 and 217 dishes. Check, do not assume either way |
| Clover (WordPress plugin) | `/wp-json/moo-clover/v1/categories`, then `/categories/{uuid}/items` |
| Clover COLO2 (`*.cloveronline.com`) | RSC payload of `/menu/all` — `"menu":{"categories","items"}`, prices in cents. See below |
| Olo | `/oloservice/v1/merchants/.../menu` |
| Owner.com | `/menu` — server-side schema.org graph even when the homepage renders nothing |
| Shopify | `/products.json` |
| SpotHopper | `window.__NUXT__`, a minified IIFE — evaluate in a sandbox (`vm.runInContext`) |
| MenuStar | `functions/restaurant.php?function=get_items`, walked per category |
| NetWaiter | `POST /<city>/menu/GetMenu` on the storefront host, body `{}` — see below |
| Popmenu | each menu's OWN page (`/menus/<slug>?location=<loc>`) is server-rendered with priced JSON-LD. The `/menu` landing page is a shell — see below |
| Menufy | `api.menufy.com/v1/locations/<id>/categories/all?api_key=…` — public API, static key, see below |
| ChowNow | `api.chownow.com/api/restaurant/<id>/menu/<next_available_time>` — the version segment is required, see below |
| Wix | spans with `data-hook="item.name"/"item.price"`, per tab |
| Squarespace | `/menu` often plain HTML |
| DoorDash **marketplace** (`doordash.com/store/...`) | schema.org `Menu` JSON-LD, server-side. Block order is not fixed: iterate the JSON-LD blocks by `@type`, do not assume `Menu` sits at a given index |
| `order.online` (DoorDash white-label) | **And a gated DoorDash store page.** A page rendering "closed" with zero items in both DOM and JSON-LD still ships the full catalog in its RSC payload — 66 items across 10 categories at one restaurant everyone had marked blocked. Like Clover's REST path, the gate is a front-end decision. The rendered DOM shows only a "Most Ordered" carousel, but the **complete per-category menu is in the escaped Next.js RSC flight payload** — GraphQL `MenuPageItem` objects, plus a `MenuBookCategory` id→name→count list to map them. The `nextCursor` is base64 and decodes to a real `categoryId`. This turned a "sample only, `dishes: []`" case into a complete 142-item capture |

**Try a browser user-agent on any host that 403s you.** For Toast that 403 was
the entire obstacle and it looked identical to "the data is not in the HTML".

**And retry a 403 before believing it.** Rancho Giant Pizza was blocked as
bot-walled and returned its entire catalog to an ordinary curl on a later night.
A block recorded once is a fact about one request, not about the host. The
inverse also holds: `jomaruusa.com` 403s the browser pane exactly as it 403s
curl, which tells you it is a server-side rule and no amount of rendering will
help.

**The Clover REST path answers even when the storefront says "Online Ordering
Currently Closed."** The gate is a front-end decision, not a data restriction.

**Two different Clover products, and BOTH are readable.** The REST path above
belongs to the WordPress `moo-clover` plugin, on the restaurant's own domain.
A `clover.com/online-ordering/<slug>` link always redirects to
`<slug>.cloveronline.com` — Clover's own hosted COLO2 app. It is a Next.js RSC
app, not a bare SPA, and the flight payload in the ordinary page carries the
whole catalog:

```
curl -s -A "<desktop UA>" "https://<slug>.cloveronline.com/menu/all" -o menu.html
node probe/extract_clover_colo2.js menu.html
```

**Prices are integer cents** — `"price":475` is $4.75 — and a `price` of 0 means
the item is priced by a required size choice, which the storefront itself
renders as "$0.00". At one coffee shop 41 of 64 items looked like that.
`--with-required-modifiers` prices those at the cheapest option in every
REQUIRED group, summed; optional add-on groups are ignored. Disclose the flag in
your notes — the figure is the smallest size. **Include the $0.00 options when
taking each group's minimum**: skipping them priced a latte at $1.10, the
cheapest "Half Caf" choice, instead of its real 12oz $5.15.

**Check the address out of the same payload** — `\"address\":{\"address1\":…}`
next to the merchant name, escaped, so grep for the street rather than the key.
One of the first seven read this way was the wrong branch of the right
business, and the payload said so.

**`clover.com/online-ordering/<slug>` tells you which product you are on**
before you fetch anything:
`curl -s "https://www.clover.com/olov2service/v2/merchants/redirect?slug=<slug>"`
returns `coloV2Enabled:true` with the `<slug>.cloveronline.com` URL, or
`coloV2Enabled:false` for the older COLO1 app, which stays on clover.com and
does NOT have this payload.

**Being the restaurant's own platform does not exempt COLO2 from the markup
test.** One of the first six read this way came back with 123 of 156 prices
dividing by 1.04 onto round dollars — a service fee baked into the storefront —
and was held. Run the check you would run on a delivery page.

**NetWaiter needs no browser, and an empty answer from it is the truth.**

```
curl -s -A "<desktop UA>" -o /dev/null -w '%{redirect_url}' https://<store>.netwaiter.com/   # gives <city>
curl -s -A "<desktop UA>" -H "Content-Type: application/json" -d '{}' \
     "https://<store>.netwaiter.com/<city>/menu/GetMenu" -o menu.json
node probe/extract_netwaiter.js menu.json
```

**Send `-d '{}'`** — bodyless returns **411**, which an agent once read as
"every fetch fails". Prices are in `PriceText` / `MinPrice`.
`{"Groups":[],"ExternalType":null}` means that storefront has an About page only
(`CanOrder":false` in the HTML) and a browser sees the same nothing; all eleven
blocked NetWaiter restaurants answer this way.

**ChowNow's obvious endpoint lies, and the fix is one path segment.**
`/api/restaurant/<id>/menu` answers **200 with `{}`**, which reads exactly like a
dead end. The menu is one segment further, at a version the restaurant endpoint
publishes:

```
curl -s -A "<desktop UA>" "https://api.chownow.com/api/restaurant/<id>" -o r.json
grep -o '"next_available_time": "[0-9]*"' r.json | head -1        # e.g. 202608311045
curl -s -A "<desktop UA>" "https://api.chownow.com/api/restaurant/<id>/menu/<stamp>" -o menu.json
node probe/extract_chownow.js menu.json
```

`<id>` is the location id from `direct.chownow.com/order/<company>/locations/<id>`
— **not** the number in an `order.chownow.com/order/<n>` link, a different id
space that has returned restaurants in other states twice. `/api/restaurant/<id>`
carries the store address; check it. An invented stamp returns `{}` exactly like
the unversioned path, and a missing `next_available_time` means the store is
closed rather than unreadable.

**Menufy ships a public API and a static key.** The storefront is a 27KB shell
with two prices in it; the catalog is one call away, and the key below is the
same on every Menufy site because it is handed to every visitor in the page:

```
curl -s -L -A "<desktop UA>" "https://<slug>.menufy.com/" -o site.html   # or the restaurant's own domain
grep -o 'location_menufy_id":[0-9]*' site.html                           # the location id
curl -s -A "<desktop UA>" \
  "https://api.menufy.com/v1/locations/<id>/categories/all?api_key=U3BlZWR5RGVzZXJ0VG9ydG9pc2U=" -o menu.json
node probe/extract_menufy.js menu.json
```

**Run the markup test on Menufy and Clover output.** Being the restaurant's own
platform does not mean the wall price: of the storefronts read tonight, IB
Thai's Menufy carried 4%, Ginza Sushi's 4% on 94% of items, and two Clover COLO2
stores 4%. Two of those were filed before anyone checked and had to be deleted.
**A 4% fee also appears as `base / 0.96`** — that is ×1.0416…, and testing ×1.04
misses it entirely (10 of 63 hits versus 62 of 63). The tell that does not care
which arithmetic was used: real menus price on `.00/.25/.50/.75/.95/.99`, and a
surcharged catalog scatters its cents.

`itemPrice` is a plain dollar number, not cents. **The location id is often on
the restaurant's OWN domain** — three of four restaurants read this way never
needed the menufy.com host at all. `/v1/locations/<id>?api_key=…` returns the
store address, which is how you confirm the branch. `itemPriceHasUpgrades: true`
means the figure is a base price before size or option choices — that is what
the restaurant publishes, so record it and say so when many items carry it.

**Popmenu keeps its menus at their own URLs, and the landing page is a decoy.**
`/menu` renders a shell carrying only a featured slice — 5 items at one
restaurant, 26 at another. Every menu has its own server-rendered page:

```
curl -s -L -A "<desktop UA>" "https://<site>/menu" -o landing.html
grep -o '"/menus/[A-Za-z0-9/_?=&-]*' landing.html | sort -u      # the menu list
curl -s -L -A "<desktop UA>" "https://<site>/menus/<slug>?location=<loc>" -o dinner.html
node probe/extract_popmenu_jsonld.js dinner.html
```

**Fetch every daypart** — one page is one menu, and filing only dinner is a
partial. **Prefix each section with its menu name**: Sogno di Vino's Arancini is
$17.95 at lunch and $18.95 at dinner, and without the prefix those read as a
duplicate rather than two real prices. Skip catering as an adjunct.

**One Popmenu site can host several sister restaurants** — Sogno di Vino's also
serves Buon Appetito, Trattoria i Trulli and The Market, and its JSON-LD lists
all four addresses. Each `Menu` in the Apollo blob carries a `restaurantLocation`
ref; check that, not the address list. Ignore the Apollo blob for prices — its
`MenuItem` and `Dish` entries have **no price field at all.**

**A host that 403s even a Chrome UA** sometimes reads through `r.jina.ai` —
though Cloudflare challenge pages defeat that too.

**Parse `__OO_STATE__` by balancing braces from the opening `{`.** Matching to
`;</script>` grabs the wrong terminator when the payload contains that sequence
and silently returns a truncated object that looks like a small menu.

**`/products.json` finds what a site SELLS ONLINE** — for a cafe that is bags of
beans, not the drinks menu. Check what you got.

### Images work. PDFs half-work. Neither needs a browser.

Pull the URL out of the HTML, curl the file down, read it.

**`Read` on a PNG or JPG works** — verified on this machine. Menu photographs,
scanned pages and board shots are one of the most productive sources here: three
restaurants in one batch (67, 60 and 51 dishes) and one six-page scanned menu
(159 dishes). If `curl` is blocked by a WAF, **WebFetch on a direct image URL
returns the binary** — save it, then `Read` it. A sideways photo is not an
unreadable one: there is no ImageMagick or Python here, so rotate with
PowerShell (`System.Drawing.Bitmap` + `RotateFlip`).

**`Read` on a PDF fails** — `poppler`'s `pdftoppm` is not installed, so it
errors with `pdftoppm is not installed`. **Never point `Read` at a PDF and never
report having done so.**

**But an image-only PDF usually contains a JPEG per page, and `Read` works on
JPEG.** A scanned or designed menu stores its pages whole, so they can be copied
out byte-for-byte with no decoder:

```
node probe/extract_pdf_images.js menu.pdf /path/to/outdir   # writes page-1.jpg, page-2.jpg…
```

Then `Read` each page like any menu photograph. Verified on Gaslamp Lumpia
Factory, whose PDF yields **2 bytes** to `pdftotext` and whose two pages came
out as fully legible JPEGs — an 87-item capture from a file that had blocked the
restaurant twice.

**This is not the discredited "read the PDF visually" claim, and the difference
is the whole point.** That claim was that `Read` renders PDF pages; it does not,
and three restaurants got invented prices out of it. This extracts a real JPEG
to a real file first, and what you then read is an image the way images have
always worked here. If the script reports no embedded JPEGs, the pages are
stored some other way, there is nothing to look at, and the restaurant is
`blocked` — **that is not an invitation to guess.**

**PDFs lie in two ways**, neither of which announces itself. `pdftotext -layout`
scrambles multi-column layouts past the point where a name can be confidently
paired with a price (wine lists especially) — plausible wrong pairs. And some
PDFs render prices as image glyphs that do not extract at all, leaving real dish
names with the prices quietly missing.

That second failure is how fabricated prices reached the database. Agents
reported "reading the PDF visually" at three restaurants whose files contain **2
bytes, one price, and four prices** of extractable text respectively. The dish
names were real, from the text layer; the prices existed nowhere. All three were
deleted and re-queued.

So: **if `pdftotext -layout` and `-raw` cannot pair a name to a price, try
`probe/extract_pdf_images.js` and read the pages** — a scrambled text layer and
a scrambled page image are different problems, and the picture is often perfectly
clear. Only if that finds no images is the PDF unusable; then mark it `blocked`
naming the PDF as unreadable. If the text layer is partial — names yes, prices no — you may price
from another source and cross-check its item list against the PDF's names,
saying exactly that in `notes`. What you may never do is fill the gap yourself.

### Genuinely needs a browser — hand back fast

Square Online (`*.square.site` ordering), HungerRush, PoppinPay, MealKeyWay,
Paytronix, Agilysys, anything behind Cloudflare or Vercel bot mitigation, and
chain SPAs that only price after a client-side store pick.

**Every name on this list is a guess until someone curls it.** Chowbus sat here
for weeks and came off it the moment an agent tried: the storefront returns
fully server-rendered HTML with all prices to a plain curl. Spend the one
request before you accept the label. **Coffee Bean & Tea Leaf's Olo storefront has defeated
five attempts** — block it immediately.

**Seven platforms have come OFF this list**, and the pattern is the same every
time. `order.online`: its virtualized grid is unreadable, its RSC payload is
not. Clover COLO2: called a React SPA for weeks, and it is a Next.js RSC app
whose payload holds the whole catalog. NetWaiter: its menu path redirects away,
and one POST returns everything. Popmenu: the landing page is a shell and the
menus live at their own URLs. Menufy and ChowNow: public APIs, one needing a
static key and the other one extra path segment. Chowbus: nothing at all — plain
curl always worked, and nobody had tried.

Each was recorded as impossible on the strength of what the page RENDERED. Treat
"the DOM shows nothing useful" as a prompt to read the payload, never as a
verdict — and if you do conclude a platform is closed, say whether you checked
the response or only the render.

Name the exact missing piece so a Chrome-equipped agent finishes it in one page
load. Handing back is not failing.

**If you DO have a browser, use it to find out why curl failed.** The Goods'
COLO2 storefront was not a JavaScript wall at all — it loaded fine and was
reporting `serviceHoursState: CLOSED`, filtering the catalog down to 1 of ~20
doughnut flavours. That is a closed-store gate, blocked only for today, and
worth a different note than "needs a browser". Check for a store-state field
before concluding anything.

## 10. Sources that are lying about who they are

**Barred outright:** Yelp's user-submitted MENU TAB. Hijacked domains — run
`curl -sIL` first; one was a four-hop chain onto a gambling site. Directory
farms: `locallya.com`, `placejoys.com`, `bestcafes.online`, `weeblyte.com`,
`gotoeat.net`, `foodjoyy.com`, `cafes-guide.com`, `poi.place`, `edan.io`, and
**any `.top` domain** — nine in this corpus were fabricated listings.

**Farm tells:** garbled scraped text with names truncated mid-word ("Ken $",
"Se $"); unrelated recipe filler; "12,480+ places, updated weekly" with a
Claim-This-Listing button. And the strongest one — **a farm sometimes copies the
wrong restaurant entirely**: `cafes-guide.com` served a Subway sandwich menu
under an unrelated restaurant's name. If a "menu" does not look like the
restaurant's cuisine, that is the tell.

**A dated Yelp or Google Maps PHOTO of the restaurant's own menu is allowed and
is strong evidence** — cite the `/biz_photos/` URL; the underlying
`yelpcdn.com/bphoto/....jpg` is often reachable straight from the HTML. It is
the menu *tab* that is barred, not photographs.

- **Find the dated ones fast.** Yelp photo `alt` text usually carries a
  `Menu as of MM/DD/YY` caption in the DOM. Filtering `img.alt` for `/menu/i`
  locates dated menu photographs in a 200+ image gallery without paging through
  it.
- **Read the whole photo set.** One agent stopped partway through 39 photos and
  left a sushi house's specialty rolls unread.
- **Photos have eras.** One set spanned 2024, 2025 and 2026 with disagreeing
  prices. Use only the most recent; never blend.
- **A "Today's Specials" board is not a menu.** Anything captioned today, this
  week or seasonal is a snapshot that will be wrong tomorrow.

**A hijacked domain is not an absent menu.** One restaurant's `.com` redirected
to an auto-parts site; its real Square ordering page carried prices 40–70%
higher than the stale photo that was the obvious fallback.

## 11. Is this even the right restaurant?

**Check the page's address against your work list's, every time.** Including
after choosing from a location picker.

- A domain matching the name may be a **same-named business in another state** —
  `elnopalitomexicanrestaurant.com` puts its address in Kennesaw, Georgia.
- **The menu itself can give the wrong city away.** `kaitorestaurant.com` looked
  like a match for an Encinitas sushi bar and belongs to a same-named restaurant
  in Bronxville, New York — confirmed by the address and by a roll literally
  named "Bronxville". Read the dish names for place names, local landmarks and
  regional specialities before trusting a domain.
- Two "Tandoor" listings both resolved to a different Tandoor across town.
- A **name mismatch is not automatically wrong**: one site was
  `colimasmexican.com`, titled "Kalentanos Colimas Mexican Food", address
  matching exactly. Same business, two names. **Verify on the address.**
- The listed website may belong to a **previous tenant**. Searching on the
  ADDRESS found a 268-dish menu after the listed domain turned out to be a
  defunct unrelated business.
- **Follow redirects** — a rebrand is not a dead site.
- `restaurants.website` is a **claim, not a fact**. Some listed domains 301 into
  directory farms.

**If your capture is much fuller than the corpus already holds for a similar
name, check the address** — it may be a duplicate record for one business rather
than a better extraction.

**One branch's menu does not go under another branch's id.** If the only
ordering page you can find belongs to a different location of the same brand,
mark it blocked. Propagation handles siblings properly — by name, with distance
checked and the source branch recorded.

**Chain SPAs:** if a chain shows items but no prices, select a San Diego
location and watch what the page fetches. Never record a chain not-found before
selecting a store. A chain head propagates its menu to every branch, so a
partial there spreads the gap — be thorough or mark it blocked. Starbucks and
McDonald's publish no prices anywhere and are retired; record `dishes: []`.

**If a platform renders blank, test host vs store.** Open two or three unrelated
restaurants on the same platform. All blank means a host-wide outage — fall back
to another source rather than blaming this restaurant. Only this one blank means
`blocked`. `res-menu.net` has done both, on different days.

## 12. Never write a dish without a real price

"Market Price", "MP", "Ask your server", a dash, `$0.00` — drop the row. A
restaurant that publishes item names and no prices is a not-found, not a menu.
Starbucks' own API returns 383 products with no price field; recording them
honestly as names with dashes produced 100 rows that looked like a menu, counted
as a menu, answered nothing, and blocked propagation to 198 branches.

**A verified pattern is not a read price.** When a menu prices by size and the
ladder looks identical everywhere — a bakery's flavors, a board stepping $1 per
size — the temptation is to read it once and apply it. Do not. At one bakery
the ladder was confirmed on two flavors, the API reported the same min and max
for all 26, and the agent had even found the two flavors that priced
differently. Fetching every variation showed **12 of the 26 do not sell all the
sizes**: 21 rows had been written for sizes that do not exist. The min and max
agreed because every flavor shares the cheapest and dearest size; that says
nothing about the four in between.

So: open enough items to have actually read the ladder, or record only the sizes
you confirmed and say which. Nothing downstream can tell a derived price from a
read one — that is why this rule has no exception for patterns you are sure of.

## 13. Safety — non-negotiable

Never submit an age gate, birthdate, login, email, or any personal detail. Never
accept terms or create accounts. Never enter payment details. Decline cookie
banners. Selecting a **store location** is allowed and is not personal data. If
a page demands personal data to show prices, record not-found and move on. Leave
a hijacked domain without clicking further.

## 14. House rules

- Do NOT run any load script. Do not commit to git. Do NOT run any Google or
  Yelp API script — those cost money and only run when Calvin is present.
- Do all your restaurants yourself. Do not spawn sub-agents — an agent that
  delegates cannot write the result file, which is the only thing that counts.
- Sibling agents share one Chrome. Unreliable clicks or modals mid-session are
  that contention, not the site. Always pass an explicit `tabId`, and **close
  every tab you open.**
- Use the EXACT restaurant name from your work list; the loader rejects a whole
  batch on a name mismatch. Always include a `dishes` key, `[]` when empty.
- Cite the artefact you actually read the prices from, not the business's
  homepage.

## Result format

```json
{
  "restaurantId": "164",
  "name": "<EXACT name from the work list>",
  "sourceUrl": "<the artefact you read the prices from>",
  "confidence": "high" | "medium" | "low",
  "crossCheckedAgainst": "<a PRICED second source, tier 5 only>",
  "blocked": "<short reason, only when stopped by something temporary>",
  "notes": "<why, whenever the result is empty or a judgement was made>",
  "dishes": [
    { "name": "...", "description": "...", "price": "$12.00", "section": "..." }
  ]
}
```

## 15. Two judgement calls that came up repeatedly

**"3PO" or "third-party ordering" on a restaurant's own Toast menu is a flag,
not a verdict.** It means the catalog was built for delivery apps and may carry
their markup. Do not discard it on that alone — cross-check a handful of
overlapping items against the restaurant's own site. One capture labelled 3PO
matched its own Wix page to the cent on six items and was trusted.

**Build-your-own items priced only inside a modifier modal:** open the modal and
record the cheapest REQUIRED option, and say in `notes` that the price is a
"from". Do not skip the item and do not invent a mid-range figure. A
protein-choice taco with no grid price is still a priced dish.

**A category that is not priced per item is not a missing price.** A gelateria's
flavour list carries no numbers because gelato is priced by size; its pizza was
39 priced rows. A brewery's beer board may genuinely print nothing. Establish
which it is by reading, then say so — that is a fact about the restaurant, not a
gap in your capture.
