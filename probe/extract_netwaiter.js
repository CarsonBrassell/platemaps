/*
 * NetWaiter menu extractor.
 *
 * NetWaiter storefronts (`<store>.netwaiter.com`) render their menu client-side
 * and redirect `/<city>/menu/` back to `/<city>/about/` under curl, which is why
 * they were logged as "no documented endpoint" and blocked eleven times. There
 * IS an endpoint, it needs no browser, no cookies and no session:
 *
 *   curl -s -A "<desktop UA>" -H "Content-Type: application/json" \
 *        -d '{}' "https://<store>.netwaiter.com/<city>/menu/GetMenu" -o menu.json
 *   node probe/extract_netwaiter.js menu.json
 *
 * The `-d '{}'` matters: the body is ignored but a missing Content-Length
 * returns 411, which reads like a block and is not one. Get `<city>` from the
 * redirect: `curl -o /dev/null -w '%{redirect_url}' https://<store>.netwaiter.com/`.
 *
 * `{"Groups":[],"ExternalType":null}` is a truthful answer, not a failure. Those
 * storefronts carry an About page only (`CanOrder":false` in the page HTML) and
 * a browser sees exactly the same nothing. Look elsewhere rather than escalating.
 */

const fs = require("node:fs");

const file = process.argv[2];
if (!file) {
  console.error("usage: node probe/extract_netwaiter.js <GetMenu-response.json>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));

/* Prices come as `PriceText` ("5.85", occasionally "5.85 - 9.50" on a
 * multi-portion item). Take only a bare number; a range is a variant list, and
 * `MinPrice` is its documented starting price. Never build a price out of a
 * range by hand - see PLAYBOOK "Never construct a price". */
function priceOf(item) {
  const text = String(item.PriceText ?? "").trim();
  if (/^\d+(\.\d{1,2})?$/.test(text)) return `$${Number(text).toFixed(2)}`;
  if (typeof item.MinPrice === "number" && item.MinPrice > 0) {
    return `$${item.MinPrice.toFixed(2)}`;
  }
  return null;
}

const rows = [];
const walk = (groups, trail) => {
  for (const group of groups ?? []) {
    /* The zero-width and soft-hyphen characters NetWaiter pads section names
     * with survive into the database and break grouping downstream. */
    const name = String(group.Name ?? "")
      .replace(/[​-‏­⁠]/g, "")
      .trim();
    const path = name ? [...trail, name] : trail;
    for (const item of group.Items ?? []) {
      rows.push({
        section: path.join(" / "),
        name: String(item.Name ?? "").trim(),
        description: String(item.Description ?? "").trim(),
        price: priceOf(item),
        portions: (item.Portions ?? []).length,
      });
    }
    walk(group.Groups, path);
  }
};
walk(data.Groups, []);

const priced = rows.filter((r) => r.price);
for (const r of priced) {
  console.log([r.section, r.name, r.price, r.description].join("\t"));
}

const unpriced = rows.length - priced.length;
console.error(
  `\n${priced.length} priced items across ${new Set(priced.map((r) => r.section)).size} sections` +
    (unpriced ? `; ${unpriced} items carried no usable price and were dropped` : "") +
    (data.ExternalType ? `; ExternalType=${data.ExternalType}` : "")
);
