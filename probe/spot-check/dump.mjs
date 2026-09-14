import { neon } from "@neondatabase/serverless";
import { writeFileSync, mkdirSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const ids = ["205","2434","164","88","147","16","138","140","609","85","1706","5","78","408","136","7","522","65","41","126","22","23","409","130","383","392","381","6761","552","3103","179","8162","9522","8","121","124","2318","6580","27","412","419","420","87","145","144","2932","410","24","1561","4819","4408","3171","2611"];
mkdirSync("probe/spot-check/data", { recursive: true });
for (const id of ids) {
  const [r] = await sql`SELECT r.*, m.status ml_status, m.source_url, m.confidence, m.attempted_at, m.dish_count FROM restaurants r LEFT JOIN menu_lookups m ON m.restaurant_id=r.id WHERE r.id=${id}`;
  if (!r) { console.log("missing", id); continue; }
  const dishes = await sql`SELECT name, price, section, left(description,120) description FROM dishes WHERE restaurant_id=${id} ORDER BY sort_order, name`;
  delete r.photo; delete r.photo_alt;
  writeFileSync(`probe/spot-check/data/${id}.json`, JSON.stringify({ restaurant: r, dishes }, null, 1));
  console.log(id, r.name, "|", r.address, "| dishes", dishes.length, "| listed", r.listed, r.hold_reason ?? "");
}
