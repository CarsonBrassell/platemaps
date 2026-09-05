# Result file format

Read THIS, not a real result file. A finished batch result is 120-180KB of
dishes; opening one to learn a 20-line shape costs an agent 10-40k tokens of
its own budget and teaches it nothing this page does not.

An extraction agent writes ONE JSON file: an array with one entry per
restaurant in its work list, rewritten in full after every restaurant.

## The three kinds of entry

**Filed** — a menu was read.

```json
{
  "restaurantId": "952",
  "name": "Pacific Pizza",
  "sourceUrl": "https://www.pacificpizza.net/menus/pizza",
  "confidence": "high",
  "crossCheckedAgainst": "https://…",
  "notes": "read from the Popmenu payload; 7 menu pages; sections carry their menu's name",
  "dishes": [
    {
      "name": "14\" Medium Pizza",
      "description": "",
      "price": "$14.00",
      "section": "Pizza / Build Your Own"
    }
  ]
}
```

**Blocked** — something temporary stopped you. Writes no ledger row, so the
restaurant re-queues and gets another chance.

```json
{
  "restaurantId": "4017",
  "name": "Ko-Li Bar",
  "sourceUrl": "https://…",
  "confidence": "low",
  "dishes": [],
  "blocked": "needs-browser: Square Online storefront renders its catalog client-side; no API path found"
}
```

**Not found** — permanent. An empty `dishes` array with NO `blocked` key
retires the restaurant from the project forever. Use it only when you are sure
no menu is published anywhere; a real example is an all-you-can-eat house that
prices per person and publishes no itemised menu.

```json
{ "restaurantId": "6149", "name": "KOGI Korean BBQ", "sourceUrl": "https://…", "confidence": "high", "dishes": [] }
```

## Field rules

| field | rule |
|---|---|
| `restaurantId` | string, copied from the work list, never invented |
| `name` | must match the work list exactly |
| `sourceUrl` | the page the prices were read from, not the homepage |
| `confidence` | `high` first-party · `medium` marketplace or directory · `low` |
| `crossCheckedAgainst` | only a PRICED source from a different owner |
| `notes` | say anything you dropped, split, or judged |
| `price` | must match `/^\$\d+(\.\d{2})?$/` — `"$8.00"`, never `8` or `"$8"` |
| `section` | prefix with the menu name when a platform splits dayparts |

## Validating

After every restaurant, re-read your own file and check it parses and every
price matches the regex. Do that from a `.js` file you write — **never
`node -e`**, because bash interpolates `$` inside the prices and the check then
reports failures you do not have.
