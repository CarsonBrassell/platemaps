# Menu Data Verification

Sample of 10 restaurants (random, excluding id 120 Great Maple which was previously verified 6/6 clean). Methodology: load the recorded `source_url` in a real browser, pick 6 stored dishes at random, compare name + price against what's on the page.

---

## STK Steakhouse San Diego (id 196) — 6/6 exact
Source: https://www.doordash.com/business/stk-40992/menu (medium confidence)
Identity: STK Steakhouse is a real chain with a San Diego (Gaslamp) location, but this DoorDash URL is a **generic, non-location-specific business page** — the page itself states "Prices are estimated based on your predicted location and may vary across store, enter address for menu prices at your nearest store." It is not confirmed this is the San Diego store's actual pricing, though item names/descriptions match a real STK menu.
- STK Cheeseburger — stored $10 +, page $10 + ✓
- Tuna Tartare — stored $42 +, page $42 + ✓
- Filet (6oz) — stored $76.8 +, page $76.8 + ✓
- Buttermilk Fried Chicken — stored $30 +, page $30 + ✓
- Maple Rubbed Salmon — stored $70.8 +, page $70.8 + ✓
- Bag O' Donuts — stored $24 +, page $24 + ✓

Note: all DoorDash prices carry a "+" suffix and appear to be inflated versions of in-restaurant menu prices (DoorDash markup, e.g. $10 for a cheeseburger is suspiciously low for a steakhouse — but it matches page verbatim, so the extraction itself is faithful to the source). The caveat is about the *source's* reliability for true menu prices, not the extraction.

---

## The Fish Market - San Diego (id 76) — 6/6 exact
Source: https://menutoeat.com/the-fish-market/ (medium confidence)
Identity: confirmed. 750 N Harbor Dr, San Diego, CA 92101, Marina District — matches the restaurant. Third-party aggregator (menutoeat.com), not the restaurant's own site, but content reads as accurate and current (page says "updated May 26, 2026").
- Wild Whole Live Maine Lobster — stored $90.50, page $90.50 ✓
- Swordfish Moroccan-Style — stored $38.00, page $38.00 ✓
- Cashew Crusted Idaho Rainbow Trout — stored $33.00, page $33.00 ✓
- Chipotle Swordfish Tacos — stored $26.00, page $26.00 ✓
- Louie Salad — stored $25.00, page $25.00 ✓
- Maryland Style Crab Cakes — stored $19.00, page $19.00 ✓

---

## Casa Guadalajara (id 184) — 6/6 exact
Source: https://www.casaguadalajara.com/menus/main-menu (high confidence)
Identity: confirmed — restaurant's own site, "Voted Best Mexican Restaurant in Old Town San Diego, CA" in page title.
- Tamales De Pollo — stored $23.00, page $23 ✓
- Enchiladas Verdes De Pollo — stored $21.45, page $21.45 ✓
- Concha De Guacamole — stored $14.75, page $14.75 ✓
- Chipotle Chicken Taquitos — stored $22.75, page "Full order $22.75" (also has an unlisted Half Order $13.75) ✓
- Albondigas Soup — stored $10.75, page $10.75 ✓
- Guadalajara Taco Salad — stored $21.75, page $21.75 ✓

Note: several items on this menu have size variants (Half/Full, Regular) and the stored price matches the larger/full variant consistently — reasonable default, not an error.

---

## Koon Thai Kitchen (id 388) — 6/6 exact
Source: https://koonthaikitchen.com/order (high confidence)
Identity: confirmed — restaurant's own online ordering page, name matches.
- Yum Pla Tod — stored $30.95, page $30.95 ✓
- Massamun Lamb Shank & Naan — stored $39.00, page $39.00 ✓
- Bangkok Strip Salad — stored $34.45, page $34.45 ✓
- Chicken Satay — stored $12.95, page $12.95 ✓
- Boat Noodles Soup — stored $17.95, page $17.95 ✓
- Panang Curry — stored $15.95, page $15.95 ✓

---

## Phil's BBQ (id 164) — 6/6 exact
Source: https://philsbbq.com/san-diego-point-loma-phil-s-bbq-food-menu (high confidence)
Identity: confirmed — restaurant's own site, URL specifically names the San Diego / Point Loma location.
- Beef Rib Dinner — stored $34.99, page $34.99 ✓
- Rib-Less Dinner — stored $17.99, page $17.99 ✓
- El Toro — stored $13.99, page $13.99 ✓
- BBQ Turkey Burger — stored $11.99, page $11.99 ✓
- Colossal Onion Rings — stored $9.99, page $9.99 ✓
- Baby Back Rib Family Meal — stored $109.99, page $109.99 ✓

Note: page lists "Half Chicken Dinner" twice ($16.99 base, $17.99 "all white meat" variant); stored dish uses the base $16.99 — consistent, not an error.

---

## OB Noodle House (id 165) — 6/6 exact
Source: https://obnoodlehouse.com/menu-ob-noodle-house/ (high confidence)
Identity: confirmed — restaurant's own site, 2218 Cable St, San Diego, CA 92107 (Ocean Beach). Note: menu text on this page does not extract via plain page-text scraping (renders empty) — had to verify via screenshots. If the automated extraction pipeline used a text-only scraper here, that is a real risk worth flagging (see report).
- Spicy Garlic Wings (12) — stored $22.95, page $22.95 ✓
- 1502 Special — stored $17.95, page $17.95 ✓
- Fried Dumplings (6) — stored $13.95, page $13.95 ✓
- Char-Grilled Shrimp Eggroll & Cold Vermicelli Noodles — stored $19.95, page $19.95 ✓
- Combo Fried Rice — stored $20.95, page $20.95 ✓
- Grilled Shrimp Teriyaki — stored $19.95, page $19.95 ✓

---

## The Crack Shack (id 136) — 6/6 exact
Source: https://www.yelp.com/menu/the-crack-shack-little-italy-san-diego (medium confidence)
Identity: confirmed — URL and page specify the Little Italy, San Diego location. Yelp page itself warns "Menu may not be up to date."
- Señor Croque — stored $16.00, page $16.00 ✓
- Katsu Lookin' — stored $15.50, page $15.50 ✓
- Little Pecker Combo — stored $14.50, page $14.50 ✓
- Half Bird — stored $23.00, page $23.00 ✓
- Mexican Poutine — stored $16.00, page $16.00 ✓
- SoCal Cobb — stored $16.00, page $16.00 ✓

---

## The Cottage La Jolla (id 25) — 6/6 exact
Source: https://thecottagerestaurants.com/del-mar-the-cottage-restaurants-la-jolla (high confidence)
Identity: confirmed, despite an odd URL (contains "del-mar" as well as "la-jolla") — the page itself is headed "LA JOLLA" / "LA JOLLA BREAKFAST + BRUNCH", so the URL slug is just an artifact of the site's routing, not a wrong-location extraction.
- Cinnamon Swirl Pancakes — stored $20.00, page $20.00 ✓
- Smoked Salmon Hash — stored $22.50, page $22.50 ✓
- Joe's Special — stored $19.00, page $19.00 ✓
- Mexicali Benedict — stored $22.50, page $22.50 ✓
- Crab & Prosciutto Benedict — stored $25.00, page $25.00 ✓
- Wild Mushroom Omelette — stored $21.00, page "Wild Mushroom" $21.00 ✓ (stored name adds "Omelette" suffix per section — harmless normalization)

---

## Richard Walker's Pancake House (id 199) — 6/6 exact (all stored dishes for this restaurant, only 6 total)
Source: https://www.doordash.com/store/richard-walker's-pancake-house-san-diego-42456/ (medium confidence)
Identity: name matches; region is generic "San Diego." Richard Walker's has multiple SD-area locations (La Jolla original, Del Mar — a review on this very page says "Much better service here @ this place than their Del Mar location"), and this generic DoorDash store page does not surface a street address to confirm which physical location the menu/prices belong to. Not flagged as wrong, but the specific-location confirmation that exists for other entries is missing here.
- Apple Pancake — stored $24.95, page $24.95 ✓
- Fresh French Strawberry Crepes — stored $23.95, page $23.95 ✓
- Ham & Cheese Omelette — stored $24.95, page $24.95 ✓
- Thick Sliced Bacon & Eggs — stored $23.95, page $23.95 ✓
- Turkey Patties & Eggs — stored $21.95, page $21.95 ✓
- One, Two, Three! — stored $17.95, page $17.95 ✓

---

## Cafe Coyote (id 183) — 6/6 exact
Source: https://cafecoyoteoldtown.com/menu/ (high confidence)
Identity: confirmed — restaurant's own site, explicitly "in the heart of Old Town San Diego."
- Sol y Mar — stored $24.95, page $24.95 ✓
- Combo Enchilada — stored $22.95, page $22.95 ✓
- Baja Fish Taco Plate — stored $21.95, page $21.95 ✓
- Suizas Enchiladas — stored $20.95, page $20.95 ✓
- Coyote Burrito Plate — stored $19.95, page $19.95 ✓
- Machaca Plate — stored $18.95, page $18.95 ✓

---

# Summary

**Sample:** 10 restaurants, 6 dishes each = 60 dish/price checks.

**Result: 60/60 exact matches (100%).** Every stored dish name and price matched the live source exactly, across DoorDash listings, Yelp menu pages, restaurant-owned sites (some JS-rendered/lazy-loaded, one image-heavy site that plain text-extraction couldn't read), and a third-party aggregator (menutoeat.com).

**Discrepancies found:** none. No wrong prices, no wrong names, no missing dishes.

**Identity/location concerns:**
- All 10 restaurants' menus plausibly belong to the correct business.
- Two sources carry soft caveats rather than hard errors:
  - **STK Steakhouse San Diego (id 196):** DoorDash business page is generic/non-location-specific and explicitly states prices "may vary across store" — the exact prices shown are unconfirmed as San-Diego-specific, though extraction faithfully matches what's on that page.
  - **Richard Walker's Pancake House (id 199):** DoorDash store page never surfaces a street address, and Richard Walker's has multiple SD-area locations (La Jolla original, Del Mar, etc. — a review on the same page contrasts this location with "their Del Mar location"). Extraction is faithful to the page, but the page itself doesn't pin down which physical restaurant.
- No menu found belonging to a clearly different business or location. No hijacked/spam/security-warning domains encountered in this sample.

**Dead/dated sources:** none. All 10 source URLs loaded successfully and served current-looking menus (one, The Fish Market's menutoeat.com page, states its own "last updated" date of May 26, 2026).

**Judgment:** This sample (10 restaurants, 60 checks, combined with the previously-verified Great Maple at 6/6) shows zero price or name errors. That is a stronger result than a spot-check like this usually produces, and it's worth being skeptical of a perfect score — but the checks were done independently, dish-by-dish, against live pages, including two sources (Casa Guadalajara, OB Noodle House) that needed scrolling/JS-rendering or screenshot-based reading rather than a simple text dump, which is exactly the kind of source a careless extraction would get wrong. It didn't. The one process risk worth flagging: OB Noodle House's menu page returns no text via plain `get_page_text` (content is JS-rendered without accessible text nodes) — if the original extraction pipeline relies on simple HTML/text scraping rather than a rendered-DOM approach, sources like that could silently fail or need special handling. Given the clean results here, the data extraction process looks sound to continue at scale, but it would be worth spot-checking a few more restaurants whose source pages are heavy JS/canvas-rendered (like OB Noodle House) specifically, since that's the one class of source where a naive scraper could produce empty or wrong results without anyone noticing.
