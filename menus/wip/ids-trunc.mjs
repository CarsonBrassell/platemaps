import fs from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const trunc = JSON.parse(fs.readFileSync("menus/wip/truncated-79.json", "utf8"));
const ids = trunc.map((t) => String(t.restaurantId));
const r = await sql`SELECT id, website FROM restaurants WHERE id = ANY(${ids})`;
const ok = r.filter((x) => x.website).map((x) => String(x.id));
fs.writeFileSync("menus/wip/trunc-with-site.txt", ok.join(","));
console.log(ok.length + " routable ids written");
