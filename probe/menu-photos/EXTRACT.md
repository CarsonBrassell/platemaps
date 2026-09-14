# Photo → dish extraction brief (for Sonnet agents)

You are given a restaurant (id, name, address) and a folder of JPGs that Google
Maps filed under its "Menu" photo category. Read every image with the Read tool.

Produce ONE JSON entry in the standard result format and write it to the path
you are told. Entry shape:

{
  "restaurantId": "<id>",
  "name": "<name>",
  "sourceUrl": "<the lh3.googleusercontent.com URL of the photo most dishes came from>",
  "confidence": "high" | "medium" | "low",
  "crossCheckedAgainst": "google-maps-menu-photos",
  "notes": "<one line: how many photos were menus, anything odd>",
  "dishes": [ { "section": "…", "name": "…", "price": 12.5, "description": "…" } ]
}

Rules
- Only transcribe what is legibly printed on a menu board, printed menu, or
  menu card. Never guess a blurred word; drop the item instead.
- `price` is a number or omit it. `description` only if printed; omit otherwise.
- Skip photos that are food plates, storefronts, receipts, or drink-only lists
  (beer taps, cocktails, wine). A bar whose only "menu" is a tap list gets
  `"dishes": []`.
- Skip modifiers/add-ons ("add avocado $2") and section headers with no items.
- If two photos show the same menu, merge them; don't duplicate items.
- Fewer than 4 legible dishes → `"dishes": []` and say why in `notes`.
- Do not invent sections; use "Menu" if the board has none.
- Write the JSON file and reply with just: `<id> <dish count> <confidence>`.
